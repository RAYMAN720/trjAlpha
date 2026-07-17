import type { MockStock } from "../data/mockStocks.js";
import type { AssetType, MarketMode } from "./marketDataProvider.js";
import type { TrendBreakoutEvaluation } from "./strategy/trendBreakoutStrategy.js";

export type ProfessionalDecision =
  | "NO_TRADE"
  | "AVOID"
  | "WEAK_WATCH"
  | "WATCH"
  | "STRONG_WATCH"
  | "PAPER_TRADE_CANDIDATE"
  | "BLOCKED_BY_RISK";

export type StrategyStatus = "NEW" | "TESTING" | "PROVEN" | "WEAK" | "DISABLED";
export type ResearchQuality = "HIGH QUALITY" | "MEDIUM QUALITY" | "LIMITED" | "LOW QUALITY";

export type ScoreBreakdownPart = {
  label: string;
  score: number;
  max: number;
  detail: string;
};

export type ChecklistItem = {
  label: string;
  passed: boolean;
  detail: string;
};

export type StrategyProof = {
  strategyName: string;
  status: StrategyStatus;
  backtestTrades: number;
  paperTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  bestMarketRegime?: string;
  worstMarketRegime?: string;
  bestAssetType?: AssetType;
  worstAssetType?: AssetType;
  summary: string;
};

export type ProfessionalAssessment = {
  assetType: AssetType;
  decision: ProfessionalDecision;
  decisionLabel: string;
  score: number;
  scoreBreakdown: ScoreBreakdownPart[];
  marketRegime: {
    state: "bullish" | "bearish" | "neutral" | "risk-off" | "high volatility";
    score: number;
    riskOff: boolean;
    summary: string;
  };
  strategy: {
    name: string;
    status: StrategyStatus;
    reason: string;
    autoTradeAllowed: boolean;
    reducedSize: boolean;
  };
  strategyProof: StrategyProof;
  researchQuality: ResearchQuality;
  confidenceQuality: "high" | "medium" | "limited" | "low";
  evidence: {
    dataSource: string;
    catalystSource: string;
    priceDataSource: string;
    researchProvider: string;
    aiProviderUsed: string;
    confidenceQuality: string;
    researchQuality: ResearchQuality;
    lastUpdated: string;
    limitations: string[];
  };
  riskReward: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    ratio: number;
    maxLossPercent: number;
  };
  riskLevel: "Low" | "Medium" | "High";
  hardFilterReasons: string[];
  noTradeReasons: string[];
  checklist: ChecklistItem[];
  catalystConfirmed: boolean;
  liquidityPassed: boolean;
  strategySetup?: TrendBreakoutEvaluation;
};

const decisionLabels: Record<ProfessionalDecision, string> = {
  NO_TRADE: "No Trade",
  AVOID: "Avoid",
  WEAK_WATCH: "Weak Watch",
  WATCH: "Watch",
  STRONG_WATCH: "Strong Watch",
  PAPER_TRADE_CANDIDATE: "Paper Trade Candidate",
  BLOCKED_BY_RISK: "Blocked By Risk"
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function professionalDecisionLabel(decision: string) {
  return decisionLabels[decision as ProfessionalDecision] ?? decision.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function relativeVolumeFor(stock: MockStock) {
  return Number((stock.volume / Math.max(stock.avgVolume, 1)).toFixed(2));
}

function scorePart(label: string, value: number, max: number, detail: string): ScoreBreakdownPart {
  return {
    label,
    score: Math.round(clamp(value, 0, max)),
    max,
    detail
  };
}

function totalScore(parts: ScoreBreakdownPart[]) {
  return Math.round(parts.reduce((total, part) => total + part.score, 0));
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function buildMarketRegime(universe: MockStock[], market: MarketMode): ProfessionalAssessment["marketRegime"] {
  const averageMove = universe.length
    ? universe.reduce((total, stock) => total + stock.dailyChangePercent, 0) / universe.length
    : 0;
  const highVolatilityCount = universe.filter((stock) => Math.abs(stock.dailyChangePercent) >= (market === "crypto" ? 12 : 8)).length;
  const negativeCount = universe.filter((stock) => stock.dailyChangePercent < -3).length;
  const riskOff = averageMove < -3 || negativeCount > universe.length * 0.45;

  if (riskOff) {
    return {
      state: "risk-off",
      score: 2,
      riskOff: true,
      summary: `${market === "crypto" ? "Crypto" : "Stock"} market is risk-off with average move ${averageMove.toFixed(2)}%.`
    };
  }

  if (highVolatilityCount > universe.length * 0.35) {
    return {
      state: "high volatility",
      score: 5,
      riskOff: false,
      summary: `Volatility is elevated across ${highVolatilityCount} tracked assets.`
    };
  }

  if (averageMove > 2) {
    return {
      state: "bullish",
      score: 9,
      riskOff: false,
      summary: `Broad tape is constructive with average move ${averageMove.toFixed(2)}%.`
    };
  }

  if (averageMove < -1.5) {
    return {
      state: "bearish",
      score: 4,
      riskOff: false,
      summary: `Broad tape is soft with average move ${averageMove.toFixed(2)}%.`
    };
  }

  return {
    state: "neutral",
    score: 7,
    riskOff: false,
    summary: `Broad tape is mixed with average move ${averageMove.toFixed(2)}%.`
  };
}

function sectorStrength(stock: MockStock, universe: MockStock[]) {
  const peers = universe.filter((item) => item.sector === stock.sector || item.industry === stock.industry);
  const leaders = peers.filter((item) => item.dailyChangePercent > 3 && relativeVolumeFor(item) > 1.2);
  const average = peers.length ? peers.reduce((total, item) => total + item.dailyChangePercent, 0) / peers.length : stock.dailyChangePercent;

  return {
    peers: peers.length,
    leaders: leaders.length,
    average,
    score: clamp(5 + average + leaders.length * 1.5, 0, 10)
  };
}

function riskRewardFor(stock: MockStock, market: MarketMode) {
  const maxLossPercent = market === "crypto" ? 4 : stock.dailyChangePercent > 12 ? 4.5 : 5;
  const entry = stock.price;
  const stopLoss = Number((entry * (1 - maxLossPercent / 100)).toFixed(entry >= 1 ? 2 : 6));
  const targetMultiple = market === "crypto" ? 2.2 : 2.1;
  const riskPerUnit = Math.max(0.000001, entry - stopLoss);
  const takeProfit = Number((entry + riskPerUnit * targetMultiple).toFixed(entry >= 1 ? 2 : 6));
  const ratio = Number(((takeProfit - entry) / riskPerUnit).toFixed(2));

  return { entry, stopLoss, takeProfit, ratio, maxLossPercent };
}

function stockStrategy(stock: MockStock, universe: MockStock[]) {
  const rv = relativeVolumeFor(stock);
  const sector = sectorStrength(stock, universe);
  const catalyst = stock.newsCatalyst.toLowerCase();

  if (stock.dailyChangePercent > 20 && stock.marketCap < 10_000_000_000) {
    return {
      name: "High-risk pump filter",
      status: "DISABLED" as StrategyStatus,
      reason: "Move is overextended and resembles a speculative pump."
    };
  }

  if (stock.dailyChangePercent > 5 && rv > 2) {
    return {
      name: "Momentum Breakout",
      status: "TESTING" as StrategyStatus,
      reason: "Price momentum and relative volume confirm breakout interest."
    };
  }

  if (stock.dailyChangePercent < -7 && stock.fundamentalsQuality > 70) {
    return {
      name: "Oversold Quality Rebound",
      status: "TESTING" as StrategyStatus,
      reason: "Quality score is acceptable while price is near an oversold zone."
    };
  }

  if (sector.leaders >= 2 && stock.dailyChangePercent > 3) {
    return {
      name: "Sector Strength Rotation",
      status: "TESTING" as StrategyStatus,
      reason: "Multiple sector or industry peers confirm the move."
    };
  }

  if (catalyst.includes("earnings") || catalyst.includes("guidance")) {
    return {
      name: "Earnings Continuation",
      status: "NEW" as StrategyStatus,
      reason: "Catalyst is earnings-related, but the continuation rule still needs more proof."
    };
  }

  return {
    name: "Pullback To Support",
    status: "NEW" as StrategyStatus,
    reason: "Setup is interesting but does not yet meet a proven breakout or rotation rule."
  };
}

function cryptoStrategy(stock: MockStock, universe: MockStock[]) {
  const rv = relativeVolumeFor(stock);
  const btc = universe.find((asset) => asset.ticker === "BTC");
  const eth = universe.find((asset) => asset.ticker === "ETH");
  const btcBullish = (btc?.dailyChangePercent ?? 0) > 0;
  const ethOutperforming = (eth?.dailyChangePercent ?? 0) > (btc?.dailyChangePercent ?? 0);
  const meme = stock.industry.toLowerCase().includes("meme");

  if (meme && stock.dailyChangePercent > 10) {
    return {
      name: "Meme coin pump filter",
      status: "WEAK" as StrategyStatus,
      reason: "Meme-coin volatility is high and must remain paper-only."
    };
  }

  if (stock.ticker === "BTC" && btcBullish && rv > 1.1) {
    return {
      name: "BTC Trend Continuation",
      status: "TESTING" as StrategyStatus,
      reason: "BTC trend is positive and volume confirms the move."
    };
  }

  if ((stock.ticker === "ETH" || stock.marketCap > 20_000_000_000) && ethOutperforming) {
    return {
      name: "ETH / Large Cap Rotation",
      status: "TESTING" as StrategyStatus,
      reason: "Large-cap crypto rotation is outperforming BTC."
    };
  }

  if (stock.dailyChangePercent > 5 && rv > 1.2 && btcBullish) {
    return {
      name: "Crypto Momentum Breakout",
      status: "TESTING" as StrategyStatus,
      reason: "Breakout is supported by 24h volume and acceptable BTC context."
    };
  }

  if (stock.dailyChangePercent < -6 && btcBullish) {
    return {
      name: "Oversold Crypto Rebound",
      status: "NEW" as StrategyStatus,
      reason: "Rebound idea needs confirmation and smaller paper sizing."
    };
  }

  return {
    name: stock.industry.toLowerCase().includes("ai") ? "AI/DePIN Narrative Momentum" : "Crypto Watchlist Setup",
    status: "NEW" as StrategyStatus,
    reason: "Narrative or trend needs more proof before auto paper trading."
  };
}

function strategyProof(strategy: ReturnType<typeof stockStrategy>, assetType: AssetType): StrategyProof {
  return {
    strategyName: strategy.name,
    status: strategy.status,
    backtestTrades: 0,
    paperTrades: 0,
    winRate: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    bestAssetType: assetType,
    worstAssetType: undefined,
    summary:
      strategy.status === "TESTING"
        ? "Strategy can paper trade with conservative sizing while the learning engine collects proof."
        : strategy.status === "PROVEN"
          ? "Strategy has enough backtest and paper-trading proof for normal paper sizing."
          : strategy.status === "NEW"
            ? "New strategy can create watchlist ideas only until it proves itself."
            : "Strategy is blocked from automatic paper trading."
  };
}

function researchQuality(stock: MockStock, catalystConfirmed: boolean) {
  const source = stock.quoteSource ?? "";
  const sourceLower = source.toLowerCase();
  const mock = !source || sourceLower.includes("fallback") || sourceLower.includes("simulation") || sourceLower.includes("mock") || sourceLower.includes("static") || sourceLower.includes("unavailable");

  if (!stock.price || !stock.volume) return "LOW QUALITY" as ResearchQuality;
  if (mock && !catalystConfirmed) return "LOW QUALITY" as ResearchQuality;
  if (mock) return "LIMITED" as ResearchQuality;
  if (catalystConfirmed) return "MEDIUM QUALITY" as ResearchQuality;
  return "LIMITED" as ResearchQuality;
}

function scoreBreakdownFor(stock: MockStock, market: MarketMode, universe: MockStock[], regime: ProfessionalAssessment["marketRegime"]) {
  const rv = relativeVolumeFor(stock);
  const sector = sectorStrength(stock, universe);
  const catalystConfirmed = Boolean(stock.newsCatalyst?.trim());
  const technicalStrength = clamp(8 + stock.dailyChangePercent * 1.25 + rv * 3, 0, 20);
  const liquidityScore = market === "crypto"
    ? clamp(Math.log10(Math.max(stock.volume, 1)) * 1.8, 0, 15)
    : clamp(Math.log10(Math.max(stock.volume, 1)) * 1.25, 0, 10);
  const volatilityRisk = clamp(15 - Math.max(0, Math.abs(stock.dailyChangePercent) - 4) * 0.9, 0, 15);
  const riskRewardScore = stock.dailyChangePercent > 20 || stock.dailyChangePercent < -20 ? 4 : 8;

  if (market === "crypto") {
    const btc = universe.find((asset) => asset.ticker === "BTC");
    const eth = universe.find((asset) => asset.ticker === "ETH");
    const btcEthScore = clamp(8 + (btc?.dailyChangePercent ?? 0) * 0.7 + (eth?.dailyChangePercent ?? 0) * 0.4, 0, 15);
    return [
      scorePart("Crypto market regime", (regime.score / 10) * 15, 15, regime.summary),
      scorePart("BTC/ETH context", btcEthScore, 15, `BTC ${btc?.dailyChangePercent.toFixed(2) ?? "n/a"}%, ETH ${eth?.dailyChangePercent.toFixed(2) ?? "n/a"}%.`),
      scorePart("Technical setup", technicalStrength, 20, `24h move ${stock.dailyChangePercent.toFixed(2)}%, relative volume ${rv.toFixed(2)}x.`),
      scorePart("Volume/liquidity", liquidityScore, 15, `24h volume proxy ${compact(stock.volume)}.`),
      scorePart("Volatility risk", volatilityRisk, 15, `Absolute 24h move ${Math.abs(stock.dailyChangePercent).toFixed(2)}%.`),
      scorePart("Narrative/catalyst", catalystConfirmed ? 8 : 3, 10, catalystConfirmed ? stock.newsCatalyst : "No confirmed catalyst."),
      scorePart("Risk/reward", riskRewardScore, 10, "Default paper plan targets at least 2:1.")
    ];
  }

  return [
    scorePart("Market regime", regime.score, 10, regime.summary),
    scorePart("Sector strength", sector.score, 10, `${stock.sector} has ${sector.leaders}/${sector.peers} peers moving with strength.`),
    scorePart("Catalyst", catalystConfirmed ? 12 : 4, 15, catalystConfirmed ? stock.newsCatalyst : "No confirmed catalyst."),
    scorePart("Technical setup", technicalStrength, 20, `Daily move ${stock.dailyChangePercent.toFixed(2)}%, relative volume ${rv.toFixed(2)}x.`),
    scorePart("Fundamentals", (stock.fundamentalsQuality / 100) * 15, 15, `Fundamentals quality ${stock.fundamentalsQuality}/100.`),
    scorePart("Valuation", (stock.valuationScore / 100) * 10, 10, `Valuation score ${stock.valuationScore}/100.`),
    scorePart("Liquidity", liquidityScore, 10, `Volume ${compact(stock.volume)}, market cap ${compact(stock.marketCap)}.`),
    scorePart("Risk/reward", riskRewardScore, 10, "Default paper plan targets at least 2:1.")
  ];
}

export function buildProfessionalAssessment(stock: MockStock, market: MarketMode, universe: MockStock[]): ProfessionalAssessment {
  const assetType: AssetType = market === "crypto" ? "crypto" : "stock";
  const rv = relativeVolumeFor(stock);
  const regime = buildMarketRegime(universe, market);
  const strategy = market === "crypto" ? cryptoStrategy(stock, universe) : stockStrategy(stock, universe);
  const proof = strategyProof(strategy, assetType);
  const riskReward = riskRewardFor(stock, market);
  const catalystConfirmed = Boolean(stock.newsCatalyst?.trim());
  const breakdown = scoreBreakdownFor(stock, market, universe, regime);
  const score = totalScore(breakdown);
  const hardFilterReasons: string[] = [];
  const noTradeReasons: string[] = [];

  if (market === "stocks") {
    if (stock.price < 2) hardFilterReasons.push("Price is below $2.");
    if (stock.marketCap < 300_000_000) hardFilterReasons.push("Market cap is too small.");
    if (stock.volume < 1_000_000) hardFilterReasons.push("Volume is below the stock minimum.");
    if (rv < 1.5) hardFilterReasons.push("Relative volume is below the stock threshold.");
    if (stock.dailyChangePercent > 25) hardFilterReasons.push("Stock is up more than 25% in one day.");
    if (stock.dailyChangePercent < -25) hardFilterReasons.push("Stock is down more than 25% in one day.");
  } else {
    if (stock.volume < 5_000_000) hardFilterReasons.push("24h volume is below the crypto minimum.");
    if (stock.dailyChangePercent > 25) hardFilterReasons.push("Crypto asset is up more than 25% in 24h.");
    if (stock.dailyChangePercent < -25) hardFilterReasons.push("Crypto asset is down more than 25% in 24h.");
    if (Math.abs(stock.dailyChangePercent) > 20) hardFilterReasons.push("Crypto volatility is extreme.");
    if (stock.industry.toLowerCase().includes("meme") && stock.dailyChangePercent > 10) {
      hardFilterReasons.push("Meme-coin pump risk is high.");
    }
  }

  if (riskReward.ratio < 2) hardFilterReasons.push("Risk/reward ratio is below 2:1.");
  if (riskReward.stopLoss <= 0) hardFilterReasons.push("Stop-loss is missing.");

  if (score < 75) noTradeReasons.push("Score is below the automatic paper-trading threshold.");
  if (regime.riskOff && score < 85) noTradeReasons.push("Market regime is risk-off and score is below the higher risk-off threshold.");
  if (!catalystConfirmed) noTradeReasons.push("No confirmed catalyst. This is technical-only analysis.");
  if (strategy.status === "NEW") noTradeReasons.push("Strategy is new and can only create watchlist ideas.");
  if (strategy.status === "WEAK" || strategy.status === "DISABLED") noTradeReasons.push("Strategy is weak or disabled by the strategy gate.");
  if (hardFilterReasons.length) noTradeReasons.push(...hardFilterReasons);

  const autoTradeAllowed =
    score >= 75 &&
    !hardFilterReasons.length &&
    !regime.riskOff &&
    (strategy.status === "TESTING" || strategy.status === "PROVEN");
  const riskLevel: ProfessionalAssessment["riskLevel"] =
    hardFilterReasons.length > 1 || strategy.status === "WEAK" || strategy.status === "DISABLED" || Math.abs(stock.dailyChangePercent) > 20
      ? "High"
      : stock.dailyChangePercent > 10 || rv > 3
        ? "Medium"
        : "Low";

  const decision: ProfessionalDecision =
    hardFilterReasons.length && score >= 75
      ? "BLOCKED_BY_RISK"
      : score < 40 || riskLevel === "High"
        ? "AVOID"
        : regime.riskOff && score < 85
          ? "NO_TRADE"
          : score < 60
            ? "WEAK_WATCH"
            : score < 75
              ? "WATCH"
              : autoTradeAllowed
                ? "PAPER_TRADE_CANDIDATE"
                : "STRONG_WATCH";

  const quality = researchQuality(stock, catalystConfirmed);
  const dataSource = stock.quoteSource ?? "Mock market data";
  const limitations = [
    ...(catalystConfirmed ? [] : ["No confirmed catalyst. This is technical-only analysis."]),
    ...(dataSource.toLowerCase().includes("mock") || dataSource.toLowerCase().includes("fallback")
      ? ["Mock or fallback data. Do not use for real-money decisions."]
      : []),
    "AI explanations are optional. Deterministic strategy and risk rules make the decision.",
    "Paper trading results do not guarantee real trading results."
  ];

  const checklist: ChecklistItem[] = [
    { label: "Market regime acceptable", passed: !regime.riskOff, detail: regime.summary },
    { label: "Catalyst checked", passed: catalystConfirmed, detail: catalystConfirmed ? stock.newsCatalyst : "No confirmed catalyst." },
    { label: "Liquidity checked", passed: !hardFilterReasons.some((reason) => reason.toLowerCase().includes("volume")), detail: `Relative volume ${rv.toFixed(2)}x.` },
    { label: "Risk/reward valid", passed: riskReward.ratio >= 2, detail: `${riskReward.ratio.toFixed(2)}:1 planned reward/risk.` },
    { label: "Stop-loss valid", passed: riskReward.stopLoss > 0, detail: `Stop-loss ${riskReward.stopLoss}.` },
    { label: "Strategy proven enough", passed: strategy.status === "TESTING" || strategy.status === "PROVEN", detail: `${strategy.name}: ${strategy.status}.` },
    { label: "Paper performance acceptable", passed: strategy.status !== "WEAK" && strategy.status !== "DISABLED", detail: proof.summary }
  ];

  return {
    assetType,
    decision,
    decisionLabel: professionalDecisionLabel(decision),
    score,
    scoreBreakdown: breakdown,
    marketRegime: regime,
    strategy: {
      ...strategy,
      autoTradeAllowed,
      reducedSize: strategy.status === "TESTING"
    },
    strategyProof: proof,
    researchQuality: quality,
    confidenceQuality: quality === "HIGH QUALITY" ? "high" : quality === "MEDIUM QUALITY" ? "medium" : quality === "LIMITED" ? "limited" : "low",
    evidence: {
      dataSource,
      catalystSource: catalystConfirmed ? "Supplied catalyst field" : "No confirmed catalyst",
      priceDataSource: dataSource,
      researchProvider: "TradePilot deterministic professional engine",
      aiProviderUsed: "none",
      confidenceQuality: quality,
      researchQuality: quality,
      lastUpdated: stock.quoteUpdatedAt ?? new Date().toISOString(),
      limitations
    },
    riskReward,
    riskLevel,
    hardFilterReasons,
    noTradeReasons,
    checklist,
    catalystConfirmed,
    liquidityPassed: !hardFilterReasons.some((reason) => reason.toLowerCase().includes("volume"))
  };
}
