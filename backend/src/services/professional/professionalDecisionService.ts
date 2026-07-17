import type { MockStock } from "../../data/mockStocks.js";
import { prisma } from "../../utils/prisma.js";
import { checkQuoteForExecution } from "../marketSafetyService.js";
import type { AssetType } from "../marketDataProvider.js";
import { evaluateExecutionQualityForStock } from "../executionQuality/executionQualityEngine.js";
import { advancedRiskApproval } from "../risk/advancedRiskManager.js";
import { getCurrentProfessionalMarketRegime } from "./marketRegimeService.js";
import { evaluateProfessionalTradeCommittee } from "./tradeCommitteeCore.js";
import { getTradingControl } from "./tradingControlService.js";

export type CommitteePlan = {
  id: string;
  assetType: string;
  ticker: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  strategyName: string;
  strategyStatus: string;
  signalKey?: string | null;
  analysisId?: string | null;
  professionalJson: string;
};

function parseProfessionalJson(value: string) {
  try {
    return JSON.parse(value) as {
      professional?: {
        score?: number;
        strategy?: { autoTradeAllowed?: boolean; status?: string };
        strategySetup?: { score?: number; actionable?: boolean; strategyVersion?: string };
      };
      execution?: { executionGrade?: string; blocked?: boolean };
    };
  } catch {
    return {};
  }
}

export async function evaluateAndRecordTradeCommittee(input: {
  assetType: AssetType;
  plan: CommitteePlan;
  stock: MockStock;
  liveStrategy: { score: number; actionable: boolean; strategyName?: string; strategyVersion?: string };
}) {
  const parsed = parseProfessionalJson(input.plan.professionalJson);
  const [regime, advancedRisk, control, analysis] = await Promise.all([
    getCurrentProfessionalMarketRegime(input.assetType, { persist: true }),
    advancedRiskApproval({ assetType: input.assetType, ticker: input.plan.ticker, sector: input.stock.sector }),
    getTradingControl(),
    input.plan.analysisId
      ? prisma.aIAnalysis.findUnique({ where: { id: input.plan.analysisId } }).catch(() => null)
      : Promise.resolve(null)
  ]);
  const quoteCheck = checkQuoteForExecution(input.stock, input.assetType, { requireOpenMarket: input.assetType === "stock" });
  const execution = evaluateExecutionQualityForStock({
    assetType: input.assetType,
    stock: input.stock,
    score: input.liveStrategy.score,
    entryPrice: input.stock.price,
    stopLoss: input.plan.stopLoss,
    takeProfit: input.plan.takeProfit
  });
  const signalScore = Math.round(parsed.professional?.score ?? input.liveStrategy.score);
  const committee = evaluateProfessionalTradeCommittee({
    signalScore,
    strategyScore: input.liveStrategy.score,
    strategyActionable: input.liveStrategy.actionable,
    strategyStatus: input.plan.strategyStatus,
    riskApproved: advancedRisk.approved && control.newEntriesEnabled,
    riskState: advancedRisk.status.state,
    emergencyHalt: control.emergencyHalt || !control.newEntriesEnabled,
    riskRewardRatio: input.plan.riskRewardRatio,
    regime,
    executionGrade: execution.executionGrade,
    executionBlocked: execution.blocked,
    dataExecutable: quoteCheck.executable,
    aiRecommendation: analysis?.recommendation,
    aiConfidence: analysis?.confidence
  });

  const record = await prisma.professionalDecisionRecord.create({
    data: {
      assetType: input.assetType,
      ticker: input.plan.ticker,
      strategyName: input.liveStrategy.strategyName ?? input.plan.strategyName,
      strategyVersion: input.liveStrategy.strategyVersion ?? parsed.professional?.strategySetup?.strategyVersion ?? "trend-breakout-v2",
      decision: committee.decision,
      committeeScore: committee.committeeScore,
      confidence: committee.confidence,
      positionSizeMultiplier: committee.positionSizeMultiplier,
      signalScore,
      strategyScore: input.liveStrategy.score,
      marketRegime: regime.regime,
      riskState: advancedRisk.status.state,
      executionGrade: execution.executionGrade,
      riskRewardRatio: input.plan.riskRewardRatio,
      signalKey: input.plan.signalKey,
      tradePlanId: input.plan.id,
      shadowOnly: committee.decision !== "APPROVE_PAPER",
      votesJson: JSON.stringify(committee.votes),
      reasonsJson: JSON.stringify(committee.reasons),
      contextJson: JSON.stringify({
        quoteCheck,
        execution,
        regime,
        risk: advancedRisk.status,
        control,
        ai: analysis
          ? { provider: analysis.provider, recommendation: analysis.recommendation, confidence: analysis.confidence, technicalOnly: analysis.technicalOnly }
          : null
      })
    }
  });

  return { committee, regime, advancedRisk, control, quoteCheck, execution, record };
}

export async function linkDecisionToPaperTrade(decisionId: string, paperTradeId: string) {
  return prisma.professionalDecisionRecord.update({ where: { id: decisionId }, data: { paperTradeId, shadowOnly: false } });
}

export async function getRecentProfessionalDecisions(take = 60, assetType?: AssetType) {
  return prisma.professionalDecisionRecord.findMany({
    where: assetType ? { assetType } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(300, take))
  });
}
