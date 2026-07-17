import { prisma } from "../utils/prisma.js";
import type { MockStock } from "../data/mockStocks.js";
import type { TradePlan } from "@prisma/client";
import { createAlert } from "./alertService.js";
import { riskAgent } from "./agentService.js";
import { getOrCreateUserSettings } from "./userSettingsService.js";
import { marketDataProvider, marketForAssetType, type AssetType } from "./marketDataProvider.js";
import { buildProfessionalAssessment } from "./professionalEngine.js";
import { enrichStrategyProof } from "./strategyProofService.js";
import { applyStrongStrategyAssessment, evaluateStrongStockStrategy } from "./strategy/strongStrategyService.js";
import { analyzeMultiTimeframe } from "./multiTimeframe/multiTimeframeEngine.js";
import { evaluateExecutionQualityForStock } from "./executionQuality/executionQualityEngine.js";
import { advancedRiskApproval } from "./risk/advancedRiskManager.js";

export type RiskEvaluation = {
  blocked: boolean;
  reasons: string[];
  severity: "Info" | "Warning" | "High";
};

export async function evaluatePaperTradeRisk(input: {
  assetType?: AssetType;
  stock: MockStock;
  score: number;
  riskLevel: string;
  plan?: TradePlan;
  jobName?: string;
}): Promise<RiskEvaluation> {
  const user = await getOrCreateUserSettings();
  const assetType = input.assetType ?? "stock";
  const openTrades = await prisma.paperTrade.count({ where: { assetType, status: "Open" } });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const closedToday = await prisma.paperTrade.findMany({
    where: {
      closedAt: { gte: todayStart },
      assetType
    }
  });
  const dailyPl = closedToday.reduce((total, trade) => total + trade.profitLoss, 0);
  const dailyLossLimit = -(user.demoCapital * (user.maxDailyLossPercent / 100));
  const relativeVolume = Number((input.stock.volume / input.stock.avgVolume).toFixed(2));
  const market = marketForAssetType(assetType);
  const universe = await marketDataProvider.getMarketUniverse(market);
  const baseAssessment = buildProfessionalAssessment(input.stock, market, universe);
  const strategyAssessment = assetType === "stock"
    ? applyStrongStrategyAssessment(baseAssessment, await evaluateStrongStockStrategy(input.stock))
    : {
        ...baseAssessment,
        decision: "NO_TRADE" as const,
        strategy: { ...baseAssessment.strategy, status: "NEW" as const, autoTradeAllowed: false },
        noTradeReasons: [...baseAssessment.noTradeReasons, "Automatic crypto trading is disabled in the focused stock-strategy release."]
      };
  const professional = await enrichStrategyProof(strategyAssessment);
  const [timeframe, advancedRisk] = await Promise.all([
    analyzeMultiTimeframe(input.stock.ticker, assetType),
    advancedRiskApproval({ assetType, ticker: input.stock.ticker, sector: input.stock.sector })
  ]);
  const execution = evaluateExecutionQualityForStock({
    assetType,
    stock: input.stock,
    score: professional.score,
    entryPrice: input.plan?.entryPrice ?? input.stock.price,
    stopLoss: input.plan?.stopLoss,
    takeProfit: input.plan?.takeProfit
  });
  const reasons: string[] = [];

  if (assetType === "stock" && input.stock.price < 10) reasons.push("Trend Breakout V2 requires a stock price of at least $10.");
  if (assetType === "crypto") reasons.push("Automatic crypto trading is disabled in the focused stock-strategy release.");
  if (input.stock.dailyChangePercent > 25) reasons.push("Asset is up more than 25% in one day.");
  if (input.stock.dailyChangePercent < -25) reasons.push("Asset is down more than 25% in one day.");
  if (input.stock.dailyChangePercent > 20) reasons.push("Asset is already up more than 20%; do not chase.");
  if (assetType === "crypto" && relativeVolume < 0.5) reasons.push("Relative volume is below the crypto minimum threshold.");
  if (assetType === "crypto" && input.stock.volume < 5_000_000) reasons.push("24h volume is below the crypto minimum.");
  if (assetType === "crypto" && Math.abs(input.stock.dailyChangePercent) > 20) reasons.push("Crypto volatility is extreme.");
  if (assetType === "crypto" && input.stock.industry.toLowerCase().includes("meme") && input.stock.dailyChangePercent > 10) {
    reasons.push("Meme-coin pump risk is high.");
  }
  if (openTrades >= user.maxOpenTrades) reasons.push("Maximum open paper trades exceeded.");
  if (dailyPl <= dailyLossLimit) reasons.push("Daily demo loss limit reached.");
  if (input.score < 85 || professional.score < 85) reasons.push("Trend Breakout V2 requires a deterministic score of at least 85.");
  if (assetType === "stock" && !professional.strategySetup?.actionable) reasons.push("Trend Breakout V2 did not pass every mandatory entry rule.");
  if (input.riskLevel === "High") reasons.push("High-risk candidates are blocked from automatic paper trading.");
  if (input.plan && input.plan.riskRewardRatio < 2) reasons.push("Risk/reward ratio is below 2:1.");
  if (input.plan && input.plan.stopLoss <= 0) reasons.push("Stop-loss is missing.");
  if (professional.marketRegime.riskOff && professional.score < 85) reasons.push("Market regime is risk-off and score is below the higher risk-off threshold.");
  if (professional.strategy.status === "NEW") reasons.push("Strategy is new and can only create watchlist ideas.");
  if (professional.strategy.status === "WEAK" || professional.strategy.status === "DISABLED") {
    reasons.push(`Strategy is ${professional.strategy.status.toLowerCase()} and cannot auto-paper-trade.`);
  }
  // Trend Breakout V2 already evaluates daily, hourly, 15-minute, VWAP, liquidity and chase risk
  // from historical candles. Legacy execution heuristics remain display-only for this strategy.
  if (!professional.strategySetup) {
    if (timeframe.alignment === "conflicting") reasons.push("Multi-timeframe alignment is conflicting.");
    if (timeframe.dailyTrend === "bearish" && professional.score < 85) reasons.push("Daily timeframe is bearish and score is below 85.");
    if (execution.executionGrade === "F") reasons.push("Execution quality grade is F.");
    if (execution.executionGrade === "C" || execution.executionGrade === "D") reasons.push(`Execution quality is only ${execution.executionGrade}; auto paper trading requires A/B quality.`);
    if (execution.blocked) reasons.push(...execution.warnings);
  }
  if (!advancedRisk.approved) reasons.push(...advancedRisk.warnings);
  reasons.push(...professional.hardFilterReasons.filter((reason) => !reasons.includes(reason)));

  const evaluation: RiskEvaluation = {
    blocked: reasons.length > 0,
    reasons,
    severity: reasons.length > 2 || input.riskLevel === "High" ? "High" : reasons.length ? "Warning" : "Info"
  };

  await riskAgent(
    {
      assetType,
      ticker: input.stock.ticker,
      blocked: evaluation.blocked,
      reasons: evaluation.reasons,
      riskLevel: input.riskLevel
    },
    input.jobName
  );

  if (evaluation.blocked) {
    await prisma.riskEvent.create({
      data: {
        assetType,
        ticker: input.stock.ticker,
        rule: "auto-paper-trade-guardrails",
        severity: evaluation.severity,
        blocked: true,
        message: reasons.join(" "),
        contextJson: JSON.stringify({
          score: input.score,
          professionalScore: professional.score,
          professionalDecision: professional.decision,
          strategyName: professional.strategy.name,
          strategyStatus: professional.strategy.status,
          timeframeAlignment: timeframe.alignment,
          executionGrade: execution.executionGrade,
          riskState: advancedRisk.status.state,
          riskLevel: input.riskLevel,
          dailyChangePercent: input.stock.dailyChangePercent,
          relativeVolume
        })
      }
    });

    await createAlert({
      assetType,
      ticker: input.stock.ticker,
      alertType: "risk warning",
      severity: evaluation.severity,
      message: `${input.stock.ticker} blocked by risk engine: ${reasons[0]}`
    });
  }

  return evaluation;
}

export async function blockRealTradingAttempt(context: Record<string, unknown>) {
  const assetType: AssetType = context.assetType === "crypto" ? "crypto" : "stock";
  await prisma.riskEvent.create({
    data: {
      assetType,
      ticker: "SYSTEM",
      rule: "real-trading-disabled",
      severity: "High",
      blocked: true,
      message: "Real trading is disabled. Only automatic paper trading is allowed.",
      contextJson: JSON.stringify(context)
    }
  });

  return createAlert({
    assetType,
    ticker: "SYSTEM",
    alertType: "risk warning",
    severity: "High",
    message: "Real trading is disabled in this MVP. Request blocked."
  });
}
