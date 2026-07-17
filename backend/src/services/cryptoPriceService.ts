import { mockCrypto } from "../data/mockCrypto.js";
import type { MockStock } from "../data/mockStocks.js";
import type { HistoricalPoint, HistoricalTimeframe } from "./stockPriceService.js";

type BinanceTicker = { symbol: string; priceChangePercent: string; lastPrice: string; quoteVolume: string; closeTime?: number };
type BinanceKline = [number, string, string, string, string, string, number, string, number, ...unknown[]];

const refreshMs = Number(process.env.CRYPTO_PRICE_REFRESH_MS ?? 5_000);
const maxDbInt = 2_000_000_000;
const binanceBaseUrl = process.env.CRYPTO_PRICE_BASE_URL?.trim() || "https://api.binance.com";
const tickerSymbols = mockCrypto.map((asset) => `${asset.ticker}USDT`);

let cachedUniverse: MockStock[] | null = null;
let cacheExpiresAt = 0;
const chartCache = new Map<string, { expiresAt: number; points: HistoricalPoint[] }>();

function safeDbInt(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.min(maxDbInt, Math.round(value)));
}

function roundPrice(value: number) {
  if (value >= 1000) return Number(value.toFixed(2));
  if (value >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(6));
}

async function fetchJson<T>(url: string, timeoutMs = 5_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Binance request failed with status ${response.status}.`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function staticReferenceUniverse(reason: string) {
  return mockCrypto.map((asset) => ({
    ...asset,
    quoteSource: `Static crypto reference data (not executable): ${reason}`,
    quoteUpdatedAt: "",
    marketState: "Unavailable"
  }));
}

async function fetchBinanceTickers() {
  const params = new URLSearchParams({ symbols: JSON.stringify(tickerSymbols) });
  return fetchJson<BinanceTicker[]>(`${binanceBaseUrl}/api/v3/ticker/24hr?${params.toString()}`);
}

function mergeQuotes(tickers: BinanceTicker[]) {
  const bySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  return mockCrypto.map((asset) => {
    const ticker = bySymbol.get(`${asset.ticker}USDT`);
    const price = Number(ticker?.lastPrice);
    const dailyChangePercent = Number(ticker?.priceChangePercent);
    const quoteVolume = Number(ticker?.quoteVolume);
    if (!ticker || !Number.isFinite(price) || price <= 0 || !Number.isFinite(dailyChangePercent)) {
      return { ...asset, quoteSource: "Binance quote unavailable (not executable)", quoteUpdatedAt: "", marketState: "Unavailable" };
    }
    const previousClose = price / (1 + dailyChangePercent / 100);
    const volume = safeDbInt(quoteVolume, asset.volume);
    const seededRelativeVolume = Math.max(0.05, asset.volume / asset.avgVolume);
    return {
      ...asset,
      price: roundPrice(price),
      previousClose: roundPrice(previousClose),
      dailyChangePercent: Number(dailyChangePercent.toFixed(2)),
      volume,
      avgVolume: safeDbInt(volume / seededRelativeVolume, asset.avgVolume),
      quoteSource: "Binance public 24h ticker feed",
      quoteUpdatedAt: new Date(ticker.closeTime ?? Date.now()).toISOString(),
      marketState: "24h ticker"
    };
  });
}

export async function getLiveCryptoUniverse() {
  if (cachedUniverse && cacheExpiresAt > Date.now()) return cachedUniverse;
  try {
    cachedUniverse = mergeQuotes(await fetchBinanceTickers());
  } catch (error) {
    cachedUniverse = staticReferenceUniverse(error instanceof Error ? error.message : "Binance unavailable");
  }
  cacheExpiresAt = Date.now() + Math.max(refreshMs, 1_000);
  return cachedUniverse;
}

function binanceInterval(timeframe: HistoricalTimeframe) {
  if (timeframe === "daily" || timeframe === "1d") return "1d";
  return timeframe;
}

export async function getHistoricalCryptoChart(tickerInput: string, timeframe: HistoricalTimeframe = "daily"): Promise<HistoricalPoint[]> {
  const ticker = tickerInput.toUpperCase();
  const cacheKey = `${ticker}:${timeframe}`;
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.points;
  const interval = binanceInterval(timeframe);
  const limit = timeframe === "daily" || timeframe === "1d" ? 365 : 300;
  const params = new URLSearchParams({ symbol: `${ticker}USDT`, interval, limit: String(limit) });
  try {
    const klines = await fetchJson<BinanceKline[]>(`${binanceBaseUrl}/api/v3/klines?${params.toString()}`, 7_000);
    const points = klines.flatMap((item) => {
      const open = Number(item[1]);
      const high = Number(item[2]);
      const low = Number(item[3]);
      const close = Number(item[4]);
      const volume = Number(item[7] || item[5]);
      if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return [];
      return [{
        date: new Date(item[0]).toISOString(),
        open: roundPrice(open),
        high: roundPrice(high),
        low: roundPrice(low),
        close: roundPrice(close),
        price: roundPrice(close),
        volume: safeDbInt(volume, 1),
        source: `Binance historical ${interval}`
      }];
    });
    if (!points.length) throw new Error("No valid Binance candles were returned.");
    chartCache.set(cacheKey, { expiresAt: Date.now() + (interval === "1d" ? 15 * 60_000 : 60_000), points });
    return points;
  } catch {
    return [];
  }
}
