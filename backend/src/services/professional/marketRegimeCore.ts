export type RegimeAsset = {
  ticker?: string;
  price: number;
  previousClose: number;
  dailyChangePercent: number;
  volume?: number;
  avgVolume?: number;
};

export type RegimeCandle = {
  close: number;
  date?: string;
};

export type ProfessionalMarketRegime =
  | "BULL_TREND"
  | "BULL_VOLATILE"
  | "SIDEWAYS"
  | "BEAR_TREND"
  | "RISK_OFF"
  | "UNKNOWN";

export type MarketRegimeAssessment = {
  regime: ProfessionalMarketRegime;
  longScore: number;
  confidence: number;
  allowLongBreakouts: boolean;
  positionSizeMultiplier: number;
  metrics: {
    trackedAssets: number;
    advancersPercent: number;
    strongAdvancersPercent: number;
    declinersPercent: number;
    averageChangePercent: number;
    medianAbsoluteMovePercent: number;
    benchmarkClose: number | null;
    benchmarkSma50: number | null;
    benchmarkSma200: number | null;
    benchmarkReturn20Percent: number | null;
    benchmarkVolatility20Percent: number | null;
  };
  summary: string;
  warnings: string[];
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

function realizedVolatilityPercent(values: number[], period = 20) {
  if (values.length < period + 1) return null;
  const recent = values.slice(-(period + 1));
  const returns = recent.slice(1).map((value, index) => Math.log(value / recent[index]));
  const mean = average(returns);
  const variance = average(returns.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function classifyProfessionalMarketRegime(input: {
  universe: RegimeAsset[];
  benchmarkHistory?: RegimeCandle[];
}): MarketRegimeAssessment {
  const universe = input.universe.filter(
    (asset) => Number.isFinite(asset.price) && asset.price > 0 && Number.isFinite(asset.dailyChangePercent)
  );
  const changes = universe.map((asset) => asset.dailyChangePercent);
  const advancersPercent = universe.length ? (changes.filter((value) => value > 0).length / universe.length) * 100 : 0;
  const strongAdvancersPercent = universe.length ? (changes.filter((value) => value >= 1).length / universe.length) * 100 : 0;
  const declinersPercent = universe.length ? (changes.filter((value) => value < 0).length / universe.length) * 100 : 0;
  const averageChangePercent = average(changes);
  const medianAbsoluteMovePercent = median(changes.map(Math.abs));

  const benchmarkCloses = (input.benchmarkHistory ?? [])
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value) && value > 0);
  const benchmarkClose = benchmarkCloses.at(-1) ?? null;
  const benchmarkSma50 = sma(benchmarkCloses, 50);
  const benchmarkSma200 = sma(benchmarkCloses, 200);
  const benchmarkReturn20Percent = benchmarkCloses.length >= 21
    ? ((benchmarkCloses.at(-1)! - benchmarkCloses.at(-21)!) / benchmarkCloses.at(-21)!) * 100
    : null;
  const benchmarkVolatility20Percent = realizedVolatilityPercent(benchmarkCloses, 20);

  const hasLongBenchmark = benchmarkClose !== null && benchmarkSma50 !== null && benchmarkSma200 !== null;
  const benchmarkBullish = Boolean(
    hasLongBenchmark && benchmarkClose! > benchmarkSma50! && benchmarkSma50! > benchmarkSma200!
  );
  const benchmarkBearish = Boolean(hasLongBenchmark && benchmarkClose! < benchmarkSma200!);
  const breadthWeak = advancersPercent < 35;
  const breadthStrong = advancersPercent >= 55 && strongAdvancersPercent >= 25;
  const elevatedVolatility =
    (benchmarkVolatility20Percent ?? 0) >= 28 || medianAbsoluteMovePercent >= 3 || Math.abs(averageChangePercent) >= 2.5;

  const warnings: string[] = [];
  let regime: ProfessionalMarketRegime = "UNKNOWN";

  if (universe.length < 5) {
    warnings.push("Too few valid assets are available to trust market breadth.");
  } else if ((benchmarkBearish && breadthWeak) || (averageChangePercent <= -2.5 && advancersPercent < 25)) {
    regime = "RISK_OFF";
  } else if (benchmarkBearish || (averageChangePercent <= -1.1 && advancersPercent < 42)) {
    regime = "BEAR_TREND";
  } else if (benchmarkBullish && breadthStrong && elevatedVolatility) {
    regime = "BULL_VOLATILE";
  } else if (benchmarkBullish && breadthStrong) {
    regime = "BULL_TREND";
  } else if (hasLongBenchmark || universe.length >= 5) {
    regime = "SIDEWAYS";
  }

  if (!hasLongBenchmark) warnings.push("Benchmark history is shorter than 200 sessions; regime confidence is reduced.");
  if (elevatedVolatility) warnings.push("Volatility is elevated, so position size and order aggressiveness should be reduced.");
  if (breadthWeak) warnings.push("Market breadth is weak; long breakouts have a lower probability of follow-through.");

  let longScore = 50;
  longScore += (advancersPercent - 50) * 0.55;
  longScore += clamp(averageChangePercent * 4, -18, 18);
  if (benchmarkBullish) longScore += 22;
  if (benchmarkBearish) longScore -= 25;
  if ((benchmarkReturn20Percent ?? 0) > 2) longScore += 8;
  if ((benchmarkReturn20Percent ?? 0) < -5) longScore -= 12;
  if (elevatedVolatility) longScore -= 7;
  longScore = Math.round(clamp(longScore));

  const confidence = Math.round(
    clamp(
      35 + Math.min(25, universe.length * 1.5) + Math.min(35, benchmarkCloses.length / 6) - (hasLongBenchmark ? 0 : 15)
    )
  );

  const positionSizeMultiplier: Record<ProfessionalMarketRegime, number> = {
    BULL_TREND: 1,
    BULL_VOLATILE: 0.6,
    SIDEWAYS: 0.45,
    BEAR_TREND: 0.25,
    RISK_OFF: 0,
    UNKNOWN: 0
  };
  const allowLongBreakouts =
    (regime === "BULL_TREND" || regime === "BULL_VOLATILE") && longScore >= 65 && confidence >= 55;

  const label = regime.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const summary = `${label}: ${advancersPercent.toFixed(0)}% of tracked assets are advancing, the average move is ${averageChangePercent.toFixed(2)}%, and the long-side regime score is ${longScore}/100.`;

  return {
    regime,
    longScore,
    confidence,
    allowLongBreakouts,
    positionSizeMultiplier: positionSizeMultiplier[regime],
    metrics: {
      trackedAssets: universe.length,
      advancersPercent: rounded(advancersPercent),
      strongAdvancersPercent: rounded(strongAdvancersPercent),
      declinersPercent: rounded(declinersPercent),
      averageChangePercent: rounded(averageChangePercent),
      medianAbsoluteMovePercent: rounded(medianAbsoluteMovePercent),
      benchmarkClose: benchmarkClose === null ? null : rounded(benchmarkClose, 4),
      benchmarkSma50: benchmarkSma50 === null ? null : rounded(benchmarkSma50, 4),
      benchmarkSma200: benchmarkSma200 === null ? null : rounded(benchmarkSma200, 4),
      benchmarkReturn20Percent: benchmarkReturn20Percent === null ? null : rounded(benchmarkReturn20Percent),
      benchmarkVolatility20Percent: benchmarkVolatility20Percent === null ? null : rounded(benchmarkVolatility20Percent)
    },
    summary,
    warnings
  };
}
