import { prisma } from "../../utils/prisma.js";
import { marketDataProvider, marketForAssetType, normalizeAssetType } from "../marketDataProvider.js";
import { reconcilePaperAccount } from "../paperAccountService.js";

export type CandleTimeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export type TradeCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9: number;
  ema20: number;
  ema50: number;
  sma200: number;
  rsi: number;
  macd: number;
  atr: number;
  support: number;
  resistance: number;
};

function normalizeTimeframe(value?: string): CandleTimeframe {
  return ["5m", "15m", "1h", "4h", "1d"].includes(String(value)) ? (String(value) as CandleTimeframe) : "1d";
}

function round(value: number, priceReference = value) {
  return Number(value.toFixed(priceReference >= 1 ? 2 : 6));
}

function ema(previous: number, close: number, period: number) {
  const multiplier = 2 / (period + 1);
  return close * multiplier + previous * (1 - multiplier);
}

function rsiFrom(closes: number[]) {
  const recent = closes.slice(-15);
  if (recent.length < 3) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const diff = recent[index] - recent[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return gains > 0 ? 70 : 50;
  const rs = gains / losses;
  return Math.min(99, Math.max(1, 100 - 100 / (1 + rs)));
}

export async function getCandles(assetTypeInput: string, symbolInput: string, timeframeInput?: string) {
  const assetType = normalizeAssetType(assetTypeInput);
  const market = marketForAssetType(assetType);
  const timeframe = normalizeTimeframe(timeframeInput);
  const providerTimeframe = timeframe === "1d" ? "daily" : timeframe;
  const symbol = symbolInput.toUpperCase();
  const [asset, points] = await Promise.all([
    marketDataProvider.getStock(symbol, market),
    marketDataProvider.getChart(symbol, market, providerTimeframe)
  ]);

  const candles: TradeCandle[] = [];
  const closes: number[] = [];
  let ema9Value = points[0]?.close ?? 0;
  let ema20Value = ema9Value;
  let ema50Value = ema9Value;

  for (const point of points) {
    closes.push(point.close);
    ema9Value = ema(ema9Value, point.close, 9);
    ema20Value = ema(ema20Value, point.close, 20);
    ema50Value = ema(ema50Value, point.close, 50);
    const smaWindow = closes.slice(-200);
    const sma200 = smaWindow.reduce((total, item) => total + item, 0) / Math.max(1, smaWindow.length);
    const priorForAtr = candles.slice(-13);
    const trueRange = Math.max(
      point.high - point.low,
      Math.abs(point.high - (candles.at(-1)?.close ?? point.open)),
      Math.abs(point.low - (candles.at(-1)?.close ?? point.open))
    );
    const atr = (priorForAtr.reduce((total, item) => total + item.atr, 0) + trueRange) / (priorForAtr.length + 1);
    const recent = [...candles.slice(-19), { low: point.low, high: point.high }];
    const support = Math.min(...recent.map((item) => item.low));
    const resistance = Math.max(...recent.map((item) => item.high));
    candles.push({
      time: point.date,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      ema9: round(ema9Value, point.close),
      ema20: round(ema20Value, point.close),
      ema50: round(ema50Value, point.close),
      sma200: round(sma200, point.close),
      rsi: round(rsiFrom(closes), 100),
      macd: round(ema9Value - ema20Value, point.close),
      atr: round(atr, point.close),
      support: round(support, point.close),
      resistance: round(resistance, point.close)
    });
  }

  return {
    assetType,
    symbol,
    timeframe,
    dataQuality: candles.length ? "LIVE HISTORICAL DATA" : "UNAVAILABLE",
    quoteUpdatedAt: asset?.quoteUpdatedAt || null,
    dataSource: points.at(-1)?.source ?? null,
    candles
  };
}

export async function getChartMarkers(assetTypeInput: string, symbolInput: string) {
  await reconcilePaperAccount(undefined, { createSnapshot: false });
  const assetType = normalizeAssetType(assetTypeInput);
  const symbol = symbolInput.toUpperCase();
  const [savedMarkers, trades] = await Promise.all([
    prisma.tradeChartMarker.findMany({
      where: { assetType, symbol },
      orderBy: { time: "asc" }
    }),
    prisma.paperTrade.findMany({
      where: { assetType, ticker: symbol },
      orderBy: { openedAt: "asc" }
    })
  ]);

  const fallbackMarkers = trades.flatMap((trade) => {
    const markers = [
      {
        id: `${trade.id}-buy`,
        positionId: null,
        assetType,
        ticker: trade.ticker,
        symbol: trade.ticker,
        markerType: "BUY",
        price: trade.entryPrice,
        time: trade.openedAt,
        label: `BUY @ ${trade.entryPrice.toFixed(2)}`,
        colorType: "green",
        reason: "paper_trade_opened",
        createdAt: trade.openedAt
      }
    ];
    if (trade.closedAt && trade.exitPrice) {
      markers.push({
        id: `${trade.id}-sell`,
        positionId: null,
        assetType,
        ticker: trade.ticker,
        symbol: trade.ticker,
        markerType: "SELL",
        price: trade.exitPrice,
        time: trade.closedAt,
        label: `SELL @ ${trade.exitPrice.toFixed(2)}\nP/L: ${trade.profitLoss >= 0 ? "+" : ""}${trade.profitLoss.toFixed(2)}`,
        colorType: trade.profitLoss >= 0 ? "green" : "red",
        reason: trade.status,
        createdAt: trade.closedAt
      });
    }
    return markers;
  });

  const savedKeys = new Set(savedMarkers.map((marker) => `${marker.markerType}-${marker.time.toISOString()}-${marker.price}`));
  return [
    ...savedMarkers,
    ...fallbackMarkers.filter((marker) => !savedKeys.has(`${marker.markerType}-${marker.time.toISOString()}-${marker.price}`))
  ].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
}

export async function getPositionLines(assetTypeInput: string, symbolInput: string) {
  await reconcilePaperAccount(undefined, { createSnapshot: false });
  const assetType = normalizeAssetType(assetTypeInput);
  const symbol = symbolInput.toUpperCase();
  const position = await prisma.paperPosition.findFirst({
    where: { assetType, symbol, status: "Open" },
    orderBy: { openedAt: "desc" }
  });

  if (!position) return [];

  return [
    { type: "entry", price: position.entryPrice, label: `Entry ${position.entryPrice.toFixed(2)}`, colorType: "green" },
    { type: "current", price: position.currentPrice, label: `Current ${position.currentPrice.toFixed(2)}`, colorType: "neutral" },
    { type: "stop_loss", price: position.stopLoss, label: `Stop ${position.stopLoss.toFixed(2)}`, colorType: "red" },
    { type: "take_profit", price: position.takeProfit, label: `Target ${position.takeProfit.toFixed(2)}`, colorType: "green" }
  ];
}
