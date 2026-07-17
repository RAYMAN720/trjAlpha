import type { MarketChartPoint } from "../marketDataProvider.js";

export type TimeframeName = "5m" | "15m" | "1h" | "4h" | "daily";

export type TimeframeAnalysis = {
  timeframe: TimeframeName;
  trend: "bullish" | "bearish" | "neutral";
  rsi: number;
  movingAveragePosition: "above" | "below" | "mixed";
  volumeConfirmation: boolean;
  support: number;
  resistance: number;
  setupStatus: "breakout" | "pullback" | "range" | "breakdown";
  score: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function rsi(closes: number[], period = 14) {
  const slice = closes.slice(-(period + 1));
  if (slice.length < 3) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < slice.length; index += 1) {
    const difference = slice[index] - slice[index - 1];
    if (difference > 0) gains += difference;
    if (difference < 0) losses += Math.abs(difference);
  }
  if (losses === 0) return gains > 0 ? 70 : 50;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function precision(price: number) {
  return price >= 1 ? 2 : 6;
}

export function analyzeTimeframeCandles(candles: MarketChartPoint[], timeframe: TimeframeName): TimeframeAnalysis {
  if (candles.length < 10) {
    return {
      timeframe,
      trend: "neutral",
      rsi: 50,
      movingAveragePosition: "mixed",
      volumeConfirmation: false,
      support: 0,
      resistance: 0,
      setupStatus: "range",
      score: 0
    };
  }

  const recent = candles.slice(-60);
  const closes = recent.map((candle) => candle.close);
  const volumes = recent.map((candle) => candle.volume);
  const latest = recent[recent.length - 1];
  const shortAverage = average(closes.slice(-10));
  const mediumAverage = average(closes.slice(-30));
  const latestRsi = rsi(closes);
  const averageVolume = average(volumes.slice(-20, -1));
  const volumeConfirmation = averageVolume > 0 && latest.volume >= averageVolume * 1.1;
  const movePercent = closes.length > 10 ? ((latest.close - closes[closes.length - 10]) / closes[closes.length - 10]) * 100 : 0;
  const trend = latest.close > shortAverage && shortAverage > mediumAverage && movePercent > 0
    ? "bullish"
    : latest.close < shortAverage && shortAverage < mediumAverage && movePercent < 0
      ? "bearish"
      : "neutral";
  const support = Math.min(...recent.slice(-20).map((candle) => candle.low));
  const resistance = Math.max(...recent.slice(-20).map((candle) => candle.high));
  const movingAveragePosition = latest.close > shortAverage && latest.close > mediumAverage
    ? "above"
    : latest.close < shortAverage && latest.close < mediumAverage
      ? "below"
      : "mixed";
  const breakout = latest.close >= resistance * 0.998 && volumeConfirmation;
  const breakdown = latest.close <= support * 1.002;
  const setupStatus = breakout ? "breakout" : breakdown ? "breakdown" : latestRsi < 45 ? "pullback" : "range";
  const score = Math.round(clamp(
    (trend === "bullish" ? 62 : trend === "bearish" ? 28 : 45) +
    (volumeConfirmation ? 12 : -4) +
    (movingAveragePosition === "above" ? 10 : movingAveragePosition === "below" ? -10 : 0) +
    (latestRsi >= 50 && latestRsi <= 68 ? 6 : latestRsi > 78 ? -10 : 0)
  ));

  return {
    timeframe,
    trend,
    rsi: Math.round(latestRsi),
    movingAveragePosition,
    volumeConfirmation,
    support: Number(support.toFixed(precision(latest.close))),
    resistance: Number(resistance.toFixed(precision(latest.close))),
    setupStatus,
    score
  };
}
