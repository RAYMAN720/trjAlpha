import type { MarketSignal } from "@prisma/client";
import { getDecision, getRiskLevel, scoreStock } from "./scannerService.js";
import type { MockStock } from "../data/mockStocks.js";
import { prisma } from "../utils/prisma.js";
import { getOrCreateUserSettings } from "./userSettingsService.js";
import { analyzeCandidate } from "./ai/fallbackRouter.js";
import type { AIAnalysisResult, CandidateContext } from "./ai/schemas.js";
import { assetTypeForMarket, marketDataProvider, type MarketMode } from "./marketDataProvider.js";
import { buildProfessionalAssessment, professionalDecisionLabel, type ProfessionalAssessment, type ResearchQuality } from "./professionalEngine.js";
import { enrichStrategyProof } from "./strategyProofService.js";

type SignalLike = Pick<
  MarketSignal,
  | "id"
  | "signalType"
  | "explanation"
  | "score"
  | "riskLevel"
  | "decision"
  | "price"
  | "dailyChangePercent"
  | "relativeVolume"
  | "createdAt"
  | "scoreBreakdownJson"
  | "checklistJson"
  | "strategyName"
  | "strategyStatus"
  | "researchQuality"
  | "noTradeReasonsJson"
  | "evidenceJson"
  | "strategyProofJson"
>;

export type ResearchReportOutput = {
  ticker: string;
  companyName: string;
  summary: string;
  whyDetected: string;
  bullCase: string;
  bearCase: string;
  risks: string;
  fundamentals: string;
  valuationComment: string;
  technicalPicture: string;
  catalysts: string;
  aiScore: number;
  confidence: number;
  riskLevel: string;
  decision: string;
  sources: Array<{ title: string; url: string }>;
  analysis?: AIAnalysisResult & { id?: string };
  professional: ProfessionalAssessment;
  scoreBreakdownJson: string;
  checklistJson: string;
  strategyName: string;
  strategyStatus: string;
  researchQuality: ResearchQuality;
  noTradeReasonsJson: string;
  evidenceJson: string;
  strategyProofJson: string;
  dataSource: string;
  catalystSource: string;
  priceDataSource: string;
  researchProvider: string;
  aiProviderUsed: string;
  confidenceQuality: string;
  limitationsJson: string;
  aiMode: string;
};

function relativeVolumeFor(stock: MockStock) {
  return Number((stock.volume / stock.avgVolume).toFixed(2));
}

function volatilityLabel(stock: MockStock) {
  const move = Math.abs(stock.dailyChangePercent);
  if (move >= 12) return "High";
  if (move >= 5) return "Medium";
  return "Low";
}

export async function buildCandidateContext(stock: MockStock, signal?: SignalLike): Promise<CandidateContext> {
  const user = await getOrCreateUserSettings();
  const assetType = stock.sector === "Crypto" ? "crypto" : "stock";
  const [openTrades, existingOpenPosition] = await Promise.all([
    prisma.paperTrade.count({ where: { assetType, status: "Open" } }),
    prisma.paperTrade.findFirst({ where: { assetType, ticker: stock.ticker, status: "Open" } })
  ]);
  const score = signal?.score ?? scoreStock(stock);
  const relativeVolume = signal?.relativeVolume ?? relativeVolumeFor(stock);
  const support = Number((stock.price * 0.96).toFixed(2));
  const resistance = Number((stock.price * 1.08).toFixed(2));
  const newsCatalyst = stock.newsCatalyst?.trim();

  return {
    candidateId: signal?.id,
    symbol: stock.ticker.toUpperCase(),
    assetClass: stock.sector === "Crypto" ? "crypto" : "stocks",
    timestamp: new Date().toISOString(),
    timeframe: "daily",
    currentPrice: stock.price,
    technicalIndicators: {
      score,
      signalType: signal?.signalType ?? "Scanner candidate",
      dailyChangePercent: signal?.dailyChangePercent ?? stock.dailyChangePercent,
      relativeVolume,
      volume: stock.volume,
      averageVolume: stock.avgVolume,
      fundamentalsQuality: stock.fundamentalsQuality,
      valuationScore: stock.valuationScore
    },
    trendState: stock.dailyChangePercent > 5 ? "Momentum uptrend" : stock.dailyChangePercent < -5 ? "Pullback" : "Mixed",
    volatility: volatilityLabel(stock),
    volumeData: {
      volume: stock.volume,
      averageVolume: stock.avgVolume,
      relativeVolume
    },
    supportResistance: {
      support,
      resistance
    },
    strategyScore: score,
    signalDirection: stock.dailyChangePercent >= 0 ? "long-watch" : "rebound-watch",
    existingOpenPosition: Boolean(existingOpenPosition),
    marketRegime: "MVP scanner regime from supplied market universe",
    suppliedNewsSummaries: newsCatalyst ? [newsCatalyst] : [],
    newsTimestamps: newsCatalyst ? [new Date().toISOString()] : [],
    sourceNames: ["Market data provider", newsCatalyst ? "Supplied catalyst field" : "No supplied news source"].filter(Boolean),
    accountRiskContext: {
      maxOpenTrades: user.maxOpenTrades,
      openTrades,
      riskPerTradePercent: user.riskPerTradePercent,
      maxDailyLossPercent: user.maxDailyLossPercent
    },
    selectedReason:
      signal?.explanation ??
      `${stock.ticker} was selected by deterministic scanner scoring from price movement, relative volume, and supplied catalyst data.`,
    marketDataTimestamp: signal?.createdAt instanceof Date ? signal.createdAt.toISOString() : new Date().toISOString(),
    newsDataHash: newsCatalyst ? Buffer.from(newsCatalyst).toString("base64").slice(0, 24) : undefined,
    strategyVersion: "tradepilot-rules-v2"
  };
}

function scoreFromAnalysis(baseScore: number, analysis: AIAnalysisResult) {
  if (analysis.recommendation === "reject") return Math.min(baseScore, 74);
  if (analysis.recommendation === "approve") return Math.max(baseScore, analysis.confidence);
  return Math.round(baseScore * 0.7 + analysis.confidence * 0.3);
}

function titleForProvider(analysis: AIAnalysisResult) {
  if (analysis.technicalOnly) return analysis.errorCode === "BELOW_MIN_SIGNAL_SCORE" ? "Technical pre-filter" : "Technical-only analysis";
  if (analysis.provider === "mistral") return "Mistral fallback analysis";
  if (analysis.provider === "remote_local") return "Remote local-model analysis";
  if (analysis.provider === "ollama") return "Ollama local analysis";
  return "OpenAI analysis";
}

function aiModeFor(analysis: AIAnalysisResult) {
  if (analysis.cached) return "CACHED_RESEARCH";
  if (analysis.technicalOnly || analysis.provider === "technical") return "TECHNICAL_ONLY";
  if (analysis.provider === "remote_local") return "REMOTE_LOCAL_MODEL";
  if (analysis.provider === "ollama") return "OLLAMA_LOCAL";
  return "AI_ENHANCED";
}

function researchQualityWithAI(base: ResearchQuality, analysis: AIAnalysisResult, assessment: ProfessionalAssessment): ResearchQuality {
  if (analysis.technicalOnly) return base === "LOW QUALITY" ? "LOW QUALITY" : "LIMITED";
  if (base === "MEDIUM QUALITY" && assessment.catalystConfirmed) return "HIGH QUALITY";
  if (base === "LOW QUALITY") return "LIMITED";
  return base;
}

async function professionalAssessmentFor(stock: MockStock): Promise<{ assessment: ProfessionalAssessment; market: MarketMode }> {
  const market: MarketMode = stock.sector === "Crypto" ? "crypto" : "stocks";
  const universe = await marketDataProvider.getMarketUniverse(market);
  return { assessment: await enrichStrategyProof(buildProfessionalAssessment(stock, market, universe)), market };
}

export async function generateResearchReport(stock: MockStock, signal?: SignalLike): Promise<ResearchReportOutput> {
  const context = await buildCandidateContext(stock, signal);
  const { assessment } = await professionalAssessmentFor(stock);
  const baseScore = assessment.score;
  const baseRiskLevel = assessment.riskLevel;
  const analysis = await analyzeCandidate(context);
  const relativeVolume = context.technicalIndicators.relativeVolume;
  const aiMode = aiModeFor(analysis);
  const finalResearchQuality = researchQualityWithAI(assessment.researchQuality, analysis, assessment);
  const evidence = {
    ...assessment.evidence,
    researchQuality: finalResearchQuality,
    aiProviderUsed: analysis.provider,
    researchProvider: analysis.technicalOnly ? assessment.evidence.researchProvider : titleForProvider(analysis),
    confidenceQuality: finalResearchQuality
  };
  const analysisLabel = analysis.technicalOnly
    ? analysis.errorCode === "BELOW_MIN_SIGNAL_SCORE"
      ? "Weak signal rejected before external AI review."
      : "AI unavailable — technical-only analysis used."
    : `${titleForProvider(analysis)} completed.`;

  return {
    ticker: stock.ticker,
    companyName: stock.companyName,
    summary:
      `${analysisLabel} Professional decision comes from deterministic market regime, strategy, checklist, and risk rules. ` +
      `${analysis.inputSummary} This is a research and paper-trading system, not financial advice.`,
    whyDetected: context.selectedReason,
    bullCase: analysis.catalysts.length
      ? analysis.catalysts.join(" ")
      : `The constructive case depends on the supplied ${context.technicalIndicators.signalType.toLowerCase()} data holding above support.`,
    bearCase:
      analysis.risks.join(" ") ||
      "The setup can fail if momentum fades, liquidity drops, or the risk engine blocks the trade plan.",
    risks:
      analysis.risks.join(" ") ||
      "Risk controls are required. Paper trading results do not imply real-money results.",
    fundamentals:
      `Supplied fundamentals quality score is ${stock.fundamentalsQuality}/100. Full filings, earnings, and balance-sheet data were not supplied to the AI provider.`,
    valuationComment:
      `Supplied valuation score is ${stock.valuationScore}/100. This is a scanner input, not a full valuation model.`,
    technicalPicture:
      `${stock.ticker} trades near ${stock.price.toFixed(2)} after a ${stock.dailyChangePercent.toFixed(2)}% daily move. ` +
      `Relative volume is ${relativeVolume.toFixed(2)}x with support near ${context.supportResistance.support} and resistance near ${context.supportResistance.resistance}.`,
    catalysts: analysis.catalysts.join(" ") || "No confirmed catalyst. This is technical-only analysis.",
    aiScore: baseScore,
    confidence: analysis.confidence,
    riskLevel: baseRiskLevel,
    decision: assessment.decision,
    sources: [
      { title: titleForProvider(analysis), url: "#" },
      { title: "TradePilot deterministic professional engine", url: "#" },
      { title: evidence.priceDataSource, url: "#" }
    ],
    analysis,
    professional: assessment,
    scoreBreakdownJson: JSON.stringify(assessment.scoreBreakdown),
    checklistJson: JSON.stringify(assessment.checklist),
    strategyName: assessment.strategy.name,
    strategyStatus: assessment.strategy.status,
    researchQuality: finalResearchQuality,
    noTradeReasonsJson: JSON.stringify(assessment.noTradeReasons),
    evidenceJson: JSON.stringify(evidence),
    strategyProofJson: JSON.stringify(assessment.strategyProof),
    dataSource: evidence.dataSource,
    catalystSource: evidence.catalystSource,
    priceDataSource: evidence.priceDataSource,
    researchProvider: evidence.researchProvider,
    aiProviderUsed: evidence.aiProviderUsed,
    confidenceQuality: String(evidence.confidenceQuality).toLowerCase(),
    limitationsJson: JSON.stringify(evidence.limitations),
    aiMode
  };
}

export function generateJournalReview(entry: {
  decision: string;
  entryReason: string;
  exitReason?: string | null;
  emotion: string;
  mistake?: string | null;
  result: string;
}) {
  const emotional = entry.emotion.toLowerCase().includes("fomo") || entry.entryReason.toLowerCase().includes("chase");
  const mistake = entry.mistake ? ` You noted this mistake: ${entry.mistake}.` : "";

  if (emotional) {
    return `You may have acted after a strong emotional trigger. Review whether the entry had a planned stop, acceptable risk/reward, and enough confirmation.${mistake} Next time, wait for a calmer setup or a pullback before approving a demo trade.`;
  }

  return `Your ${entry.decision.toLowerCase()} decision should be judged by process quality, not just result. Check whether the plan had defined risk, a clear invalidation level, and a written reason before entry.${mistake}`;
}
