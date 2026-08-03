import { mockStocks, type MockStock } from "../data/mockStocks.js";

export type HistoricalTimeframe = "5m" | "15m" | "1h" | "4h" | "daily" | "1d";
export type HistoricalPoint = {
  date: string;
  price: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  source: string;
};

type YahooQuote = {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
  preMarketPrice?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
  averageDailyVolume10Day?: number;
  averageDailyVolume3Month?: number;
  marketCap?: number;
  marketState?: string;
};

type YahooQuoteResponse = { quoteResponse?: { result?: YahooQuote[] } };
type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
};

type AlpacaBar = { o?: number; h?: number; l?: number; c?: number; t?: string; v?: number };
type AlpacaTrade = { p?: number; t?: string };
type AlpacaSnapshot = { latestTrade?: AlpacaTrade; dailyBar?: AlpacaBar; prevDailyBar?: AlpacaBar };
type AlpacaBarsResponse = { bars?: AlpacaBar[]; next_page_token?: string | null };

const refreshMs = Number(process.env.STOCK_PRICE_REFRESH_MS ?? 5_000);
const yahooBaseUrl = process.env.STOCK_PRICE_BASE_URL?.trim() || "https://query1.finance.yahoo.com";
const alpacaMarketDataBaseUrl = process.env.ALPACA_MARKET_DATA_BASE_URL?.trim() || "https://data.alpaca.markets";
const alpacaStockDataFeed = process.env.ALPACA_STOCK_DATA_FEED?.trim() || "iex";
const stockSymbols = mockStocks.map((stock) => stock.ticker);
const maxDbInt = 2_000_000_000;

let cachedUniverse: MockStock[] | null = null;
let cacheExpiresAt = 0;
const chartCache = new Map<string, { expiresAt: number; points: HistoricalPoint[] }>();

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function safeDbInt(value: number | undefined | null, fallback: number) {
  if (!isPositiveNumber(value)) return fallback;
  return Math.max(1, Math.min(maxDbInt, Math.round(value)));
}

function roundPrice(value: number) {
  if (value >= 1000) return Number(value.toFixed(2));
  if (value >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(6));
}

function quoteTimestampToIso(value?: number) {
  return isPositiveNumber(value) ? new Date(value * 1000).toISOString() : "";
}

function isoTimestamp(value?: string) {
  if (!value) return "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function staticReferenceUniverse(reason: string) {
  return mockStocks.map((stock) => ({
    ...stock,
    quoteSource: `Static reference data (not executable): ${reason}`,
    quoteUpdatedAt: "",
    marketState: "Unavailable"
  }));
}

function pickMostRecentPrice(quote: YahooQuote) {
  const candidates = [
    { price: quote.regularMarketPrice, time: quote.regularMarketTime, state: "Regular" },
    { price: quote.preMarketPrice, time: quote.preMarketTime, state: "Pre-market" },
    { price: quote.postMarketPrice, time: quote.postMarketTime, state: "Post-market" }
  ].filter((candidate): candidate is { price: number; time: number; state: string } => isPositiveNumber(candidate.price) && isPositiveNumber(candidate.time));
  return candidates.sort((left, right) => right.time - left.time)[0] ?? null;
}

function alpacaHeaders() {
  const keyId = process.env.ALPACA_API_KEY_ID?.trim();
  const secretKey = process.env.ALPACA_API_SECRET_KEY?.trim();
  if (!keyId || !secretKey) throw new Error("Alpaca market-data credentials are not configured.");
  return {
    accept: "application/json",
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secretKey
  };
}

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAlpacaSnapshots(): Promise<Record<string, AlpacaSnapshot>> {
  const params = new URLSearchParams({ symbols: stockSymbols.join(","), feed: alpacaStockDataFeed });
  const payload = await fetchJson<Record<string, unknown>>(`${alpacaMarketDataBaseUrl}/v2/stocks/snapshots?${params.toString()}`, {
    headers: alpacaHeaders()
  });
  const snapshots = "snapshots" in payload ? (payload.snapshots as Record<string, AlpacaSnapshot> | undefined) ?? {} : (payload as Record<string, AlpacaSnapshot>);
  if (!Object.keys(snapshots).length) throw new Error("Alpaca stock snapshot response was empty.");
  return snapshots;
}

async function fetchYahooQuotes() {
  const params = new URLSearchParams({ symbols: stockSymbols.join(",") });
  const payload = await fetchJson<YahooQuoteResponse>(`${yahooBaseUrl}/v7/finance/quote?${params.toString()}`, {
    headers: { accept: "application/json", "user-agent": "TradePilotAI/1.0" }
  });
  const quotes = payload.quoteResponse?.result ?? [];
  if (!quotes.length) throw new Error("Yahoo Finance quote response was empty.");
  return quotes;
}

function mergeAlpacaSnapshots(snapshots: Record<string, AlpacaSnapshot>) {
  return mockStocks.map((stock) => {
    const snapshot = snapshots[stock.ticker];
    const selectedPrice = isPositiveNumber(snapshot?.latestTrade?.p) ? snapshot.latestTrade.p : snapshot?.dailyBar?.c;
    const updatedAt = isoTimestamp(snapshot?.latestTrade?.t ?? snapshot?.dailyBar?.t);
    if (!isPositiveNumber(selectedPrice) || !updatedAt) {
      return { ...stock, quoteSource: "Alpaca quote unavailable (not executable)", quoteUpdatedAt: "", marketState: "Unavailable" };
    }
    const previousClose = isPositiveNumber(snapshot?.prevDailyBar?.c) ? snapshot.prevDailyBar.c : stock.previousClose;
    const price = roundPrice(selectedPrice);
    return {
      ...stock,
      price,
      previousClose: roundPrice(previousClose),
      dailyChangePercent: previousClose > 0 ? Number((((price - previousClose) / previousClose) * 100).toFixed(2)) : stock.dailyChangePercent,
      volume: alpacaStockDataFeed === "iex" ? stock.volume : safeDbInt(snapshot?.dailyBar?.v, stock.volume),
      quoteSource: `Alpaca Market Data (${alpacaStockDataFeed})`,
      quoteUpdatedAt: updatedAt,
      marketState: "Latest trade"
    };
  });
}

function mergeYahooQuotes(quotes: YahooQuote[]) {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  return mockStocks.map((stock) => {
    const quote = bySymbol.get(stock.ticker);
    const selected = quote ? pickMostRecentPrice(quote) : null;
    if (!quote || !selected) {
      return { ...stock, quoteSource: "Yahoo Finance quote unavailable (not executable)", quoteUpdatedAt: "", marketState: "Unavailable" };
    }
    const previousClose = isPositiveNumber(quote.regularMarketPreviousClose) ? quote.regularMarketPreviousClose : stock.previousClose;
    const price = roundPrice(selected.price);
    return {
      ...stock,
      companyName: quote.longName || quote.shortName || stock.companyName,
      price,
      previousClose: roundPrice(previousClose),
      dailyChangePercent: previousClose > 0 ? Number((((price - previousClose) / previousClose) * 100).toFixed(2)) : stock.dailyChangePercent,
      volume: safeDbInt(quote.regularMarketVolume, stock.volume),
      avgVolume: safeDbInt(quote.averageDailyVolume3Month ?? quote.averageDailyVolume10Day, stock.avgVolume),
      marketCap: isPositiveNumber(quote.marketCap) ? quote.marketCap : stock.marketCap,
      quoteSource: "Yahoo Finance public quote feed",
      quoteUpdatedAt: quoteTimestampToIso(selected.time),
      marketState: selected.state
    };
  });
}

export async function getLiveStockUniverse() {
  if (cachedUniverse && cacheExpiresAt > Date.now()) return cachedUniverse;
  let lastError = "No live provider responded.";
  try {
    cachedUniverse = mergeAlpacaSnapshots(await fetchAlpacaSnapshots());
  } catch (alpacaError) {
    lastError = alpacaError instanceof Error ? alpacaError.message : lastError;
    try {
      cachedUniverse = mergeYahooQuotes(await fetchYahooQuotes());
    } catch (yahooError) {
      lastError = yahooError instanceof Error ? yahooError.message : lastError;
      cachedUniverse = staticReferenceUniverse(lastError);
    }
  }
  cacheExpiresAt = Date.now() + Math.max(refreshMs, 1_000);
  return cachedUniverse;
}

function yahooChartSettings(timeframe: HistoricalTimeframe) {
  if (timeframe === "5m") return { interval: "5m", range: "5d" };
  if (timeframe === "15m") return { interval: "15m", range: "1mo" };
  if (timeframe === "1h" || timeframe === "4h") return { interval: "1h", range: "3mo" };
  return { interval: "1d", range: "1y" };
}

function aggregate(points: HistoricalPoint[], size: number, sourceSuffix: string) {
  const result: HistoricalPoint[] = [];
  for (let index = 0; index < points.length; index += size) {
    const group = points.slice(index, index + size);
    if (!group.length) continue;
    result.push({
      date: group[0].date,
      open: group[0].open,
      high: Math.max(...group.map((point) => point.high)),
      low: Math.min(...group.map((point) => point.low)),
      close: group[group.length - 1].close,
      price: group[group.length - 1].close,
      volume: group.reduce((total, point) => total + point.volume, 0),
      source: `${group[0].source} ${sourceSuffix}`
    });
  }
  return result;
}


function alpacaChartSettings(timeframe: HistoricalTimeframe) {
  if (timeframe === "5m") return { timeframe: "5Min", days: 7 };
  if (timeframe === "15m") return { timeframe: "15Min", days: 35 };
  if (timeframe === "1h" || timeframe === "4h") return { timeframe: "1Hour", days: 120 };
  return { timeframe: "1Day", days: 730 };
}

async function fetchAlpacaHistoricalChart(ticker: string, timeframe: HistoricalTimeframe) {
  const settings = alpacaChartSettings(timeframe);
  const params = new URLSearchParams({
    timeframe: settings.timeframe,
    start: new Date(Date.now() - settings.days * 24 * 60 * 60_000).toISOString(),
    end: new Date().toISOString(),
    adjustment: "all",
    feed: alpacaStockDataFeed,
    sort: "asc",
    limit: "10000"
  });
  const payload = await fetchJson<AlpacaBarsResponse>(
    `${alpacaMarketDataBaseUrl}/v2/stocks/${encodeURIComponent(ticker)}/bars?${params.toString()}`,
    { headers: alpacaHeaders() },
    8_000
  );
  const points = (payload.bars ?? []).flatMap((bar) => {
    if (![bar.o, bar.h, bar.l, bar.c].every(isPositiveNumber) || !bar.t) return [];
    return [{
      date: isoTimestamp(bar.t),
      open: roundPrice(bar.o as number),
      high: roundPrice(bar.h as number),
      low: roundPrice(bar.l as number),
      close: roundPrice(bar.c as number),
      price: roundPrice(bar.c as number),
      volume: safeDbInt(bar.v, 1),
      source: `Alpaca historical ${settings.timeframe} (${alpacaStockDataFeed})`
    } satisfies HistoricalPoint];
  });
  const normalized = timeframe === "4h" ? aggregate(points, 4, "aggregated to 4h") : points;
  if (!normalized.length) throw new Error("No valid Alpaca historical candles were returned.");
  return normalized;
}

export async function getHistoricalStockChart(tickerInput: string, timeframe: HistoricalTimeframe = "daily"): Promise<HistoricalPoint[]> {
  const ticker = tickerInput.toUpperCase();
  const cacheKey = `${ticker}:${timeframe}`;
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.points;

  try {
    const alpacaPoints = await fetchAlpacaHistoricalChart(ticker, timeframe);
    chartCache.set(cacheKey, {
      expiresAt: Date.now() + (timeframe === "daily" || timeframe === "1d" ? 15 * 60_000 : 60_000),
      points: alpacaPoints
    });
    return alpacaPoints;
  } catch {
    // Yahoo remains a read-only historical fallback; execution still requires a trusted fresh quote.
  }

  const settings = yahooChartSettings(timeframe);
  const params = new URLSearchParams({ interval: settings.interval, range: settings.range, includePrePost: "false", events: "div,splits" });
  try {
    const payload = await fetchJson<YahooChartResponse>(`${yahooBaseUrl}/v8/finance/chart/${encodeURIComponent(ticker)}?${params.toString()}`, {
      headers: { accept: "application/json", "user-agent": "TradePilotAI/1.0" }
    }, 7_000);
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || !timestamps.length) throw new Error("Yahoo Finance chart response was empty.");

    const points = timestamps.flatMap((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      const volume = quote.volume?.[index];
      if (![open, high, low, close].every(isPositiveNumber)) return [];
      return [{
        date: new Date(timestamp * 1000).toISOString(),
        open: roundPrice(open as number),
        high: roundPrice(high as number),
        low: roundPrice(low as number),
        close: roundPrice(close as number),
        price: roundPrice(close as number),
        volume: safeDbInt(volume, 1),
        source: `Yahoo Finance historical ${settings.interval}`
      }];
    });
    const normalized = timeframe === "4h" ? aggregate(points, 4, "aggregated to 4h") : points;
    if (!normalized.length) throw new Error("No valid Yahoo Finance candles were returned.");
    chartCache.set(cacheKey, { expiresAt: Date.now() + (timeframe === "daily" || timeframe === "1d" ? 15 * 60_000 : 60_000), points: normalized });
    return normalized;
  } catch {
    return [];
  }
}
