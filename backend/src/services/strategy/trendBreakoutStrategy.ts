import type { MockStock } from "../../data/mockStocks.js";
import type { MarketChartPoint } from "../marketDataProvider.js";

export const TREND_BREAKOUT_STRATEGY_NAME = "Trend Breakout V2";
export const TREND_BREAKOUT_STRATEGY_VERSION = "2.0.0";

export type TrendBreakoutMetrics = {
  benchmarkBullish: boolean;
  benchmarkClose: number;
  benchmarkSma50: number;
  benchmarkSma200: number;
  stockClose: number;
  ema20: number;
  ema50: number;
  sma200: number;
  atr: number;
  atrPercent: number;
  rsi14: number;
  breakoutLevel: number;
  breakoutPercent: number;
  volumeRatio: number;
  volumeBasis: "time-adjusted intraday" | "daily";
  volumeSampleSessions: number;
  relativeStrength60d: number;
  closeLocation: number;
  gapPercent: number;
  extensionAtr: number;
  intradayVwap: number;
  intradayAboveVwap: boolean;
  intradayAboveEma20: boolean;
  hourlyTrendBullish: boolean;
  executionWindowOpen: boolean;
  averageDollarVolume: number;
};

export type TrendBreakoutEvaluation = {
  strategyName: typeof TREND_BREAKOUT_STRATEGY_NAME;
  strategyVersion: typeof TREND_BREAKOUT_STRATEGY_VERSION;
  eligible: boolean;
  actionable: boolean;
  score: number;
  status: "READY" | "WATCH" | "BLOCKED";
  confirmations: string[];
  blockingReasons: string[];
  warnings: string[];
  metrics: TrendBreakoutMetrics;
  riskPlan: {
    entryTrigger: number;
    maxEntryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
    riskPerShare: number;
    atrMultiple: number;
  };
  dataQuality: "HIGH" | "LIMITED" | "UNAVAILABLE";
};

type EvaluationInput = {
  stock: MockStock;
  daily: MarketChartPoint[];
  intraday15m: MarketChartPoint[];
  hourly: MarketChartPoint[];
  benchmarkDaily: MarketChartPoint[];
  requireIntraday?: boolean;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function precision(price: number) {
  return price >= 1 ? 2 : 6;
}

function roundPrice(value: number, reference = value) {
  return Number(value.toFixed(precision(reference)));
}

export function sma(values: number[], period: number) {
  return average(values.slice(-period));
}

export function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const multiplier = 2 / (period + 1);
  return values.reduce((value, item, index) => index === 0 ? item : item * multiplier + value * (1 - multiplier), values[0]);
}

export function rsi(values: number[], period = 14) {
  const slice = values.slice(-(period + 1));
  if (slice.length < 3) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < slice.length; index += 1) {
    const change = slice[index] - slice[index - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return gains > 0 ? 100 : 50;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function atr(candles: MarketChartPoint[], period = 14) {
  const slice = candles.slice(-(period + 1));
  if (slice.length < 2) return 0;
  const ranges: number[] = [];
  for (let index = 1; index < slice.length; index += 1) {
    const current = slice[index];
    const previousClose = slice[index - 1].close;
    ranges.push(Math.max(current.high - current.low, Math.abs(current.high - previousClose), Math.abs(current.low - previousClose)));
  }
  return average(ranges);
}

function returnPercent(candles: MarketChartPoint[], lookback: number) {
  if (candles.length <= lookback) return 0;
  const first = candles[candles.length - lookback - 1]?.close ?? 0;
  const last = candles.at(-1)?.close ?? 0;
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

function newYorkDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function newYorkMinuteOfDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return -1;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function timeAdjustedRelativeVolume(candles: MarketChartPoint[]) {
  if (!candles.length) return { ratio: 0, sampleSessions: 0 };
  const latestDate = newYorkDate(candles.at(-1)?.date ?? "");
  const latestMinute = newYorkMinuteOfDay(candles.at(-1)?.date ?? "");
  if (latestMinute < 0) return { ratio: 0, sampleSessions: 0 };
  const grouped = new Map<string, MarketChartPoint[]>();
  for (const candle of candles) {
    const date = newYorkDate(candle.date);
    grouped.set(date, [...(grouped.get(date) ?? []), candle]);
  }
  const current = (grouped.get(latestDate) ?? [])
    .filter((candle) => newYorkMinuteOfDay(candle.date) <= latestMinute)
    .reduce((sum, candle) => sum + Math.max(0, candle.volume), 0);
  const priorVolumes = [...grouped.entries()]
    .filter(([date]) => date < latestDate)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 10)
    .map(([, session]) => session
      .filter((candle) => newYorkMinuteOfDay(candle.date) <= latestMinute)
      .reduce((sum, candle) => sum + Math.max(0, candle.volume), 0))
    .filter((volume) => volume > 0);
  const baseline = average(priorVolumes);
  return {
    ratio: baseline > 0 ? current / baseline : 0,
    sampleSessions: priorVolumes.length
  };
}

function sessionVwap(candles: MarketChartPoint[]) {
  const latestDate = newYorkDate(candles.at(-1)?.date ?? "");
  const session = candles.filter((candle) => newYorkDate(candle.date) === latestDate);
  const volume = session.reduce((sum, candle) => sum + Math.max(0, candle.volume), 0);
  if (!session.length || volume <= 0) return 0;
  return session.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * Math.max(0, candle.volume), 0) / volume;
}

function emptyEvaluation(stock: MockStock, reasons: string[]): TrendBreakoutEvaluation {
  const price = stock.price || 0;
  return {
    strategyName: TREND_BREAKOUT_STRATEGY_NAME,
    strategyVersion: TREND_BREAKOUT_STRATEGY_VERSION,
    eligible: false,
    actionable: false,
    score: 0,
    status: "BLOCKED",
    confirmations: [],
    blockingReasons: reasons,
    warnings: [],
    metrics: {
      benchmarkBullish: false,
      benchmarkClose: 0,
      benchmarkSma50: 0,
      benchmarkSma200: 0,
      stockClose: price,
      ema20: 0,
      ema50: 0,
      sma200: 0,
      atr: 0,
      atrPercent: 0,
      rsi14: 50,
      breakoutLevel: 0,
      breakoutPercent: 0,
      volumeRatio: 0,
      volumeBasis: "daily",
      volumeSampleSessions: 0,
      relativeStrength60d: 0,
      closeLocation: 0,
      gapPercent: 0,
      extensionAtr: 0,
      intradayVwap: 0,
      intradayAboveVwap: false,
      intradayAboveEma20: false,
      hourlyTrendBullish: false,
      executionWindowOpen: false,
      averageDollarVolume: 0
    },
    riskPlan: {
      entryTrigger: price,
      maxEntryPrice: price,
      stopLoss: price,
      takeProfit: price,
      riskReward: 0,
      riskPerShare: 0,
      atrMultiple: 0
    },
    dataQuality: "UNAVAILABLE"
  };
}

/**
 * Long-only, high-selectivity trend breakout strategy.
 * The same pure evaluator is reused by live analysis and the TypeScript backtester.
 */
export function evaluateTrendBreakout(input: EvaluationInput): TrendBreakoutEvaluation {
  const { stock, daily, intraday15m, hourly, benchmarkDaily } = input;
  const requireIntraday = input.requireIntraday ?? true;
  if (daily.length < 210 || benchmarkDaily.length < 210) {
    return emptyEvaluation(stock, ["At least 210 daily candles are required for SMA200 and walk-forward-safe analysis."]);
  }

  const latest = daily.at(-1)!;
  const previous = daily.at(-2)!;
  const prior20 = daily.slice(-21, -1);
  const prior10 = daily.slice(-11, -1);
  const closes = daily.map((candle) => candle.close);
  const benchmarkCloses = benchmarkDaily.map((candle) => candle.close);
  const benchmarkClose = benchmarkCloses.at(-1) ?? 0;
  const benchmarkSma50 = sma(benchmarkCloses, 50);
  const benchmarkSma200 = sma(benchmarkCloses, 200);
  const stockEma20 = ema(closes.slice(-120), 20);
  const stockEma50 = ema(closes.slice(-180), 50);
  const stockSma200 = sma(closes, 200);
  const atr14 = atr(daily, 14);
  const atrPercent = latest.close > 0 ? (atr14 / latest.close) * 100 : 0;
  const rsi14 = rsi(closes, 14);
  const breakoutLevel = Math.max(...prior20.map((candle) => candle.high));
  const breakoutPercent = breakoutLevel > 0 ? ((stock.price - breakoutLevel) / breakoutLevel) * 100 : 0;
  const averageVolume20 = average(prior20.map((candle) => candle.volume));
  const dailyVolumeRatio = averageVolume20 > 0 ? latest.volume / averageVolume20 : 0;
  const intradayRelativeVolume = timeAdjustedRelativeVolume(intraday15m);
  const useTimeAdjustedVolume = requireIntraday && intradayRelativeVolume.sampleSessions >= 5 && intradayRelativeVolume.ratio > 0;
  const volumeRatio = useTimeAdjustedVolume ? intradayRelativeVolume.ratio : dailyVolumeRatio;
  const volumeBasis: TrendBreakoutMetrics["volumeBasis"] = useTimeAdjustedVolume ? "time-adjusted intraday" : "daily";
  const stockReturn60 = returnPercent(daily, 60);
  const benchmarkReturn60 = returnPercent(benchmarkDaily, 60);
  const relativeStrength60d = stockReturn60 - benchmarkReturn60;
  const range = Math.max(0.000001, latest.high - latest.low);
  const closeLocation = (latest.close - latest.low) / range;
  const gapPercent = previous.close > 0 ? ((latest.open - previous.close) / previous.close) * 100 : 0;
  const extensionAtr = atr14 > 0 ? (stock.price - breakoutLevel) / atr14 : 99;
  const vwap = sessionVwap(intraday15m);
  const intradayCloses = intraday15m.map((candle) => candle.close);
  const hourlyCloses = hourly.map((candle) => candle.close);
  const intradayAboveVwap = Boolean(vwap && stock.price >= vwap);
  const intradayEma20 = ema(intradayCloses.slice(-80), 20);
  const intradayAboveEma20 = intradayCloses.length >= 20 && stock.price >= intradayEma20;
  const hourlyEma20 = ema(hourlyCloses.slice(-100), 20);
  const hourlyEma50 = ema(hourlyCloses.slice(-150), 50);
  const hourlyTrendBullish = hourlyCloses.length >= 50 && (hourlyCloses.at(-1) ?? 0) > hourlyEma20 && hourlyEma20 > hourlyEma50;
  const latestIntradayMinute = newYorkMinuteOfDay(intraday15m.at(-1)?.date ?? "");
  const executionWindowOpen = !requireIntraday || (latestIntradayMinute >= 10 * 60 && latestIntradayMinute <= 15 * 60 + 30);
  const averageDollarVolume = averageVolume20 * latest.close;
  const benchmarkBullish = benchmarkClose > benchmarkSma200 && benchmarkSma50 > benchmarkSma200 && returnPercent(benchmarkDaily, 20) > -2;
  const ema20Prior = ema(closes.slice(-121, -1), 20);
  const ema20SlopePositive = stockEma20 > ema20Prior;
  const trendBullish = stock.price > stockEma20 && stockEma20 > stockEma50 && stockEma50 > stockSma200 && ema20SlopePositive;
  const breakoutConfirmed = stock.price >= breakoutLevel * 1.001;
  const volumeConfirmed = volumeRatio >= 1.35;
  const liquid = stock.price >= 10 && averageDollarVolume >= 50_000_000;
  const volatilityHealthy = atrPercent >= 1 && atrPercent <= 6;
  const momentumHealthy = rsi14 >= 52 && rsi14 <= 72;
  const relativeStrengthHealthy = relativeStrength60d >= 3;
  const candleQuality = closeLocation >= 0.65 && gapPercent <= 8;
  const entryNotChased = extensionAtr >= -0.15 && extensionAtr <= 0.75;
  const intradayConfirmed = !requireIntraday || (intradayAboveVwap && intradayAboveEma20 && hourlyTrendBullish);

  const confirmations: string[] = [];
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const check = (passed: boolean, confirmation: string, failure: string) => {
    if (passed) confirmations.push(confirmation);
    else blockingReasons.push(failure);
  };

  check(liquid, "Institutional liquidity threshold passed.", "Requires price >= $10 and bar-derived average dollar volume >= $50M.");
  check(benchmarkBullish, "SPY regime is above its 200-day trend with positive 50/200 structure.", "Broad-market regime is not bullish enough for long breakout entries.");
  check(trendBullish, "Stock trend is aligned: price > EMA20 > EMA50 > SMA200 with rising EMA20.", "Long-term and intermediate stock trends are not fully aligned.");
  check(breakoutConfirmed, "Price confirmed a real break above the prior 20-day high.", "Price has not confirmed a breakout above the prior 20-day high.");
  check(volumeConfirmed, "Breakout volume is at least 1.35x the prior 20-day average.", "Breakout volume is below 1.35x average.");
  check(relativeStrengthHealthy, "60-day performance leads SPY by at least 3 percentage points.", "Relative strength versus SPY is insufficient.");
  check(volatilityHealthy, "ATR volatility is inside the 1%-6% tradable band.", "ATR volatility is outside the 1%-6% tradable band.");
  check(momentumHealthy, "RSI is strong but not overextended.", "RSI must be between 52 and 72.");
  check(candleQuality, "Breakout candle closed in its upper range without an excessive gap.", "Breakout candle quality is weak or the gap is excessive.");
  check(entryNotChased, "Current price is within 0.75 ATR of the breakout level.", "Entry is too extended from the breakout level.");
  check(intradayConfirmed, "15-minute VWAP/EMA and hourly trend confirm execution.", "Intraday VWAP, EMA20, and hourly trend confirmation are required.");
  check(executionWindowOpen, "Entry time is inside the 10:00-15:30 ET execution window.", "New entries are allowed only from 10:00 to 15:30 ET to avoid opening and closing auction noise.");

  if (Math.abs(stock.dailyChangePercent) > 15) warnings.push("Large daily move: size should remain reduced even when all other rules pass.");
  if (volumeRatio > 5) warnings.push("Extremely high volume can indicate event risk; confirm no halt or binary catalyst.");
  if (!intraday15m.length || !hourly.length) warnings.push("Intraday candle data is unavailable; live entry must remain blocked.");

  const entryTrigger = breakoutLevel * 1.001;
  const recentSwingLow = Math.min(...prior10.map((candle) => candle.low));
  const structuralStop = Math.max(breakoutLevel - atr14 * 0.55, recentSwingLow - atr14 * 0.1);
  const minimumNoiseStop = stock.price - atr14 * 0.8;
  const maximumAtrRiskStop = stock.price - atr14 * 2;
  const maximumPercentRiskStop = stock.price * 0.94;
  const stopLoss = Math.max(Math.min(structuralStop, minimumNoiseStop), maximumAtrRiskStop, maximumPercentRiskStop);
  const riskPerShare = Math.max(0.000001, stock.price - stopLoss);
  const takeProfit = stock.price + riskPerShare * 2.5;
  const maxEntryPrice = breakoutLevel + atr14 * 0.75;

  // Exact 100-point model. Mandatory conditions still fail closed even when the score is high.
  let score = 0;
  score += liquid ? 10 : 0;
  score += benchmarkBullish ? 15 : 0;
  score += trendBullish ? 20 : 0;
  score += breakoutConfirmed ? 10 : 0;
  score += volumeConfirmed ? 10 : 0;
  score += relativeStrengthHealthy ? 10 : 0;
  score += volatilityHealthy ? 5 : 0;
  score += momentumHealthy ? 5 : 0;
  score += candleQuality ? 3 : 0;
  score += entryNotChased ? 5 : 0;
  score += intradayConfirmed ? 5 : 0;
  score += executionWindowOpen ? 2 : 0;
  score = Math.round(clamp(score));

  const eligible = blockingReasons.length === 0;
  const actionable = eligible && score >= 85 && stock.price >= entryTrigger && stock.price <= maxEntryPrice;
  return {
    strategyName: TREND_BREAKOUT_STRATEGY_NAME,
    strategyVersion: TREND_BREAKOUT_STRATEGY_VERSION,
    eligible,
    actionable,
    score,
    status: actionable ? "READY" : score >= 70 && blockingReasons.length <= 3 ? "WATCH" : "BLOCKED",
    confirmations,
    blockingReasons,
    warnings,
    metrics: {
      benchmarkBullish,
      benchmarkClose: roundPrice(benchmarkClose),
      benchmarkSma50: roundPrice(benchmarkSma50),
      benchmarkSma200: roundPrice(benchmarkSma200),
      stockClose: roundPrice(stock.price),
      ema20: roundPrice(stockEma20, stock.price),
      ema50: roundPrice(stockEma50, stock.price),
      sma200: roundPrice(stockSma200, stock.price),
      atr: roundPrice(atr14, stock.price),
      atrPercent: Number(atrPercent.toFixed(2)),
      rsi14: Number(rsi14.toFixed(2)),
      breakoutLevel: roundPrice(breakoutLevel, stock.price),
      breakoutPercent: Number(breakoutPercent.toFixed(2)),
      volumeRatio: Number(volumeRatio.toFixed(2)),
      volumeBasis,
      volumeSampleSessions: useTimeAdjustedVolume ? intradayRelativeVolume.sampleSessions : 20,
      relativeStrength60d: Number(relativeStrength60d.toFixed(2)),
      closeLocation: Number(closeLocation.toFixed(2)),
      gapPercent: Number(gapPercent.toFixed(2)),
      extensionAtr: Number(extensionAtr.toFixed(2)),
      intradayVwap: roundPrice(vwap, stock.price),
      intradayAboveVwap,
      intradayAboveEma20,
      hourlyTrendBullish,
      executionWindowOpen,
      averageDollarVolume: Math.round(averageDollarVolume)
    },
    riskPlan: {
      entryTrigger: roundPrice(entryTrigger, stock.price),
      maxEntryPrice: roundPrice(maxEntryPrice, stock.price),
      stopLoss: roundPrice(stopLoss, stock.price),
      takeProfit: roundPrice(takeProfit, stock.price),
      riskReward: 2.5,
      riskPerShare: roundPrice(riskPerShare, stock.price),
      atrMultiple: Number((riskPerShare / Math.max(atr14, 0.000001)).toFixed(2))
    },
    dataQuality: intraday15m.length >= 20 && hourly.length >= 50 ? "HIGH" : "LIMITED"
  };
}
