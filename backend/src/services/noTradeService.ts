import { prisma } from "../utils/prisma.js";
import { assetTypeForMarket, marketDataProvider, normalizeMarketMode, type MarketMode } from "./marketDataProvider.js";
import { getLatestScan } from "./scannerService.js";
import { getAdvancedRiskStatus } from "./risk/advancedRiskManager.js";

export async function getNoTradeStatus(marketInput?: MarketMode) {
  const market = normalizeMarketMode(marketInput);
  const assetType = assetTypeForMarket(market);
  const [scan, riskStatus, universe] = await Promise.all([
    getLatestScan(market),
    getAdvancedRiskStatus(assetType),
    marketDataProvider.getMarketUniverse(market)
  ]);
  const signals = scan?.signals ?? [];
  const best = signals[0];
  const averageMove = universe.length ? universe.reduce((total, item) => total + item.dailyChangePercent, 0) / universe.length : 0;
  const reasons: string[] = [];

  if (averageMove < -3) reasons.push("Market regime risk-off.");
  if (!signals.some((signal) => signal.score >= 75)) reasons.push("No candidate above score threshold.");
  if (signals.every((signal) => signal.decision === "BLOCKED_BY_RISK" || signal.decision === "AVOID")) reasons.push("Best setups are blocked or avoid-rated.");
  if (riskStatus.tradePaused) reasons.push("Risk manager has paused paper trading.");
  if (best?.researchQuality === "LOW QUALITY") reasons.push("Research quality is low.");
  if (best?.strategyStatus === "WEAK" || best?.strategyStatus === "DISABLED") reasons.push("Strategy proof is weak or disabled.");

  const bestRejectedCandidates = signals
    .filter((signal) => signal.decision !== "PAPER_TRADE_CANDIDATE")
    .slice(0, 5)
    .map((signal) => ({
      ticker: signal.ticker,
      score: signal.score,
      decision: signal.decision,
      whyRejected: signal.noTradeReasonsJson,
      conditionNeeded: signal.score < 75 ? "Score above 75 with aligned timeframes and risk approval." : "Risk engine and execution quality must clear hard filters."
    }));

  return {
    market,
    assetType,
    noTradeToday: reasons.length > 0,
    headline: reasons.length ? "NO TRADE TODAY" : "Selective paper-trading only",
    reasons: reasons.length ? reasons : ["At least one setup may be reviewed, but risk and checklist approval are still required."],
    bestCandidate: best ?? null,
    bestRejectedCandidates,
    riskState: riskStatus.state,
    generatedAt: new Date().toISOString(),
    paperOnly: true,
    realTradingEnabled: false
  };
}
