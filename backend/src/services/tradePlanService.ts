import type { MockStock } from "../data/mockStocks.js";
import { prisma } from "../utils/prisma.js";
import { getOrCreateUserSettings } from "./userSettingsService.js";
import { marketDataProvider, marketForAssetType, normalizeAssetType, type AssetType } from "./marketDataProvider.js";
import { getTradingSessionStart } from "./marketClockService.js";
import { checkQuoteForExecution } from "./marketSafetyService.js";
import { buildProfessionalAssessment } from "./professionalEngine.js";
import { enrichStrategyProof } from "./strategyProofService.js";
import { applyStrongStrategyAssessment, evaluateStrongStockStrategy } from "./strategy/strongStrategyService.js";
import { analyzeMultiTimeframe } from "./multiTimeframe/multiTimeframeEngine.js";
import { evaluateExecutionQualityForStock } from "./executionQuality/executionQualityEngine.js";
import { getAdvancedRiskStatus } from "./risk/advancedRiskManager.js";
import { buildProfessionalChecklist } from "./proChecklist/professionalChecklistService.js";
import { professionalExecutionConfigFromEnv, simulateProfessionalFill } from "./professional/executionSimulator.js";
import { evaluateAndRecordTradeCommittee, linkDecisionToPaperTrade } from "./professional/professionalDecisionService.js";
import { assertNewPaperEntriesEnabled } from "./professional/tradingControlService.js";
import {
  reconcilePaperAccount,
  registerPaperTradeClosed,
  registerPaperTradeOpened,
  registerPaperTradePriceUpdate
} from "./paperAccountService.js";

export type TradePlanInput = {
  assetType?: AssetType;
  ticker: string;
  currentPrice: number;
  aiScore: number;
  riskLevel: string;
  dailyChangePercent?: number;
  signalKey?: string;
  analysisId?: string;
};


function stopLossStatus(status: string) {
  const normalized = status.toLowerCase().replaceAll("_", "-");
  return normalized.includes("stop-loss") || normalized.includes("stop loss");
}

async function assertTickerReentryAllowed(assetType: AssetType, ticker: string, now = new Date()) {
  const sessionStart = getTradingSessionStart(assetType, now);
  const sessionTrade = await prisma.paperTrade.findFirst({
    where: { assetType, ticker, openedAt: { gte: sessionStart } },
    orderBy: { openedAt: "desc" }
  });
  if (sessionTrade) throw new Error(`${ticker} has already been traded in the current session.`);

  const cooldownHours = Math.max(1, Number(process.env.STOP_LOSS_REENTRY_COOLDOWN_HOURS ?? 24));
  const recent = await prisma.paperTrade.findMany({
    where: { assetType, ticker, closedAt: { gte: new Date(now.getTime() - cooldownHours * 60 * 60_000) } },
    orderBy: { closedAt: "desc" },
    take: 10
  });
  if (recent.some((trade) => stopLossStatus(trade.status))) {
    throw new Error(`${ticker} is in a ${cooldownHours}-hour cooldown after a stop-loss.`);
  }
}

async function getExecutableQuoteForTrade(trade: { assetType: string; ticker: string }) {
  const assetType = normalizeAssetType(trade.assetType);
  const market = marketForAssetType(assetType);
  const liveAsset = await marketDataProvider.getStock(trade.ticker, market);
  const quoteCheck = checkQuoteForExecution(liveAsset, assetType, { requireOpenMarket: assetType === "stock" });
  if (!liveAsset || !quoteCheck.executable) {
    throw new Error(`Paper trade action blocked: ${quoteCheck.reason}`);
  }
  return { assetType, liveAsset, quoteCheck };
}

const riskPercentByLevel: Record<string, number> = {
  Low: 4,
  Medium: 6,
  High: 8
};

export async function generateTradePlan(input: TradePlanInput) {
  const user = await getOrCreateUserSettings();
  const assetType = input.assetType ?? "stock";
  const market = marketForAssetType(assetType);
  const stock = await marketDataProvider.getStock(input.ticker, market);
  const universe = stock ? await marketDataProvider.getMarketUniverse(market) : [];
  const baseAssessment = stock ? buildProfessionalAssessment(stock, market, universe) : null;
  const strategyAssessment = stock && baseAssessment
    ? assetType === "stock"
      ? applyStrongStrategyAssessment(baseAssessment, await evaluateStrongStockStrategy(stock))
      : {
          ...baseAssessment,
          decision: "NO_TRADE" as const,
          strategy: { ...baseAssessment.strategy, status: "NEW" as const, autoTradeAllowed: false },
          noTradeReasons: [...baseAssessment.noTradeReasons, "Automatic crypto trading is disabled in the focused stock-strategy release."]
        }
    : null;
  const professional = strategyAssessment ? await enrichStrategyProof(strategyAssessment) : null;
  const [timeframe, advancedRisk, openTrades] = await Promise.all([
    stock ? analyzeMultiTimeframe(input.ticker, assetType) : null,
    getAdvancedRiskStatus(assetType),
    prisma.paperTrade.count({ where: { assetType, status: "Open" } })
  ]);

  const riskPercent = riskPercentByLevel[input.riskLevel] ?? 6;
  const adjustedRiskPercent = input.riskLevel === "High" ? riskPercent * 0.75 : riskPercent;
  const baseMaxRisk = (user.demoCapital * user.riskPerTradePercent) / 100;
  const assetRiskMultiplier = assetType === "crypto" ? 0.5 : 1;
  const strategyRiskMultiplier = professional?.strategy.reducedSize ? 0.5 : 1;
  const maxRisk = Number((baseMaxRisk * assetRiskMultiplier * strategyRiskMultiplier * advancedRisk.reducedSizeMultiplier).toFixed(2));
  const entryPrice = input.currentPrice;
  const stopLoss = professional?.riskReward.stopLoss ?? Number((entryPrice * (1 - adjustedRiskPercent / 100)).toFixed(2));
  const riskPerShare = Math.max(0.01, entryPrice - stopLoss);
  const quantity = Math.floor(maxRisk / riskPerShare);
  const positionSize = Number((quantity * entryPrice).toFixed(2));
  const maxLoss = Number((quantity * riskPerShare).toFixed(2));
  const takeProfit = professional?.riskReward.takeProfit ?? Number((entryPrice + riskPerShare * 2).toFixed(2));
  const riskRewardRatio = professional?.riskReward.ratio ?? 2;
  const execution =
    stock && professional
      ? evaluateExecutionQualityForStock({
          assetType,
          stock,
          score: professional.score,
          entryPrice,
          stopLoss,
          takeProfit
        })
      : null;
  const checklist =
    stock && professional && timeframe && execution
      ? buildProfessionalChecklist({
          assetType,
          stock,
          assessment: professional,
          timeframe,
          execution,
          riskState: advancedRisk.state,
          riskRewardRatio,
          stopLoss,
          positionSize,
          openTrades,
          maxOpenTrades: user.maxOpenTrades,
          dailyLossReached: advancedRisk.dailyPl <= advancedRisk.dailyLossLimit
        })
      : null;

  const warnings: string[] = [
    "This is a research-based demo trade plan, not a guaranteed prediction.",
    "Use paper trading only. Real broker execution is disabled."
  ];

  if (assetType === "crypto") {
    warnings.push("Crypto paper plans use smaller size. No leverage, futures, or margin are allowed.");
  }

  if (professional?.strategy.reducedSize) {
    warnings.push("Strategy is in TESTING status, so paper position size is reduced while proof is collected.");
  }

  if ((professional?.score ?? input.aiScore) < 85) {
    warnings.push("Trend Breakout V2 score is below 85, so this must remain on the watchlist.");
  }

  if ((input.dailyChangePercent ?? 0) > 20) {
    warnings.push("The asset already moved more than +20%. Do not chase; wait for a better risk/reward setup.");
  }

  if (input.riskLevel === "High") {
    warnings.push("High-risk setup: position sizing has been reduced and the plan requires extra caution.");
  }

  if (quantity < 1) {
    warnings.push("Position too small for this account size.");
  }

  if (professional?.noTradeReasons.length) {
    warnings.push(...professional.noTradeReasons.slice(0, 4));
  }
  if (timeframe?.warning) warnings.push(timeframe.warning);
  if (execution?.warnings.length) warnings.push(...execution.warnings.slice(0, 3));
  if (advancedRisk.state === "REDUCED_SIZE") warnings.push("Advanced risk manager is in REDUCED_SIZE state.");
  if (advancedRisk.tradePaused) warnings.push("Advanced risk manager paused paper trading.");
  if (checklist?.blocked) warnings.push(`Professional checklist result: ${checklist.result}.`);

  const professionalScore = professional?.score ?? input.aiScore;
  const strategyStatus = professional?.strategy.status ?? "NEW";
  const blockedByProfessionalRules =
    professionalScore < 85 ||
    quantity < 1 ||
    input.riskLevel === "High" ||
    strategyStatus === "NEW" ||
    strategyStatus === "WEAK" ||
    strategyStatus === "DISABLED" ||
    Boolean(professional?.hardFilterReasons.length) ||
    Boolean(assetType === "stock" && !professional?.strategySetup?.actionable) ||
    assetType === "crypto" ||
    Boolean(!professional?.strategySetup && timeframe && timeframe.alignment === "conflicting") ||
    Boolean(!professional?.strategySetup && execution?.blocked) ||
    Boolean(advancedRisk.tradePaused) ||
    Boolean(!professional?.strategySetup && checklist?.blocked);
  const status = blockedByProfessionalRules ? "Watchlist Only" : "Draft";
  const reasoning =
    `Risk is capped at about ${user.riskPerTradePercent}% of demo capital ($${maxRisk}). ` +
    `Stop loss is structure/ATR based with a 2.5:1 initial reward/risk target when Trend Breakout V2 is active. ` +
    warnings.join(" ");

  return prisma.tradePlan.create({
    data: {
      assetType,
      ticker: input.ticker.toUpperCase(),
      entryPrice,
      stopLoss,
      takeProfit,
      positionSize,
      quantity,
      maxLoss,
      riskRewardRatio,
      reasoning,
      status,
      signalKey: input.signalKey,
      analysisId: input.analysisId,
      professionalJson: JSON.stringify({
        professional,
        timeframe,
        execution,
        riskState: advancedRisk,
        checklist
      }),
      strategyName: professional?.strategy.name ?? "Unclassified",
      strategyStatus,
      researchQuality: professional?.researchQuality ?? "LIMITED"
    }
  });
}

export async function approveDemoTrade(tradePlanId: string) {
  const plan = await prisma.tradePlan.findUnique({ where: { id: tradePlanId } });
  if (!plan) throw new Error("Trade plan not found.");
  if (plan.status === "Watchlist Only" || plan.quantity < 1) {
    throw new Error("This plan is not eligible for an active paper trade.");
  }

  await assertNewPaperEntriesEnabled();
  const assetType = normalizeAssetType(plan.assetType);
  const market = marketForAssetType(assetType);
  const liveAsset = await marketDataProvider.getStock(plan.ticker, market);
  const quoteCheck = checkQuoteForExecution(liveAsset, assetType, { requireOpenMarket: assetType === "stock" });
  if (!liveAsset || !quoteCheck.executable) throw new Error(`Paper trade blocked: ${quoteCheck.reason}`);
  if (assetType !== "stock") throw new Error("Automatic crypto trading is disabled in the focused Trend Breakout V2 release.");

  const liveSetup = await evaluateStrongStockStrategy(liveAsset);
  if (!liveSetup.actionable || liveSetup.score < 85) {
    throw new Error(`Paper trade blocked because Trend Breakout V2 is no longer actionable: ${liveSetup.blockingReasons[0] ?? "setup score below 85"}`);
  }
  if (liveAsset.price < liveSetup.riskPlan.entryTrigger || liveAsset.price > liveSetup.riskPlan.maxEntryPrice) {
    throw new Error(`Paper trade blocked because live price ${liveAsset.price} is outside the valid entry zone ${liveSetup.riskPlan.entryTrigger}-${liveSetup.riskPlan.maxEntryPrice}.`);
  }
  const priceDriftPercent = Math.abs(((liveAsset.price - plan.entryPrice) / plan.entryPrice) * 100);
  const maxEntryDriftPercent = Math.max(0.1, Number(process.env.MAX_ENTRY_PRICE_DRIFT_PERCENT ?? 1));
  if (priceDriftPercent > maxEntryDriftPercent) {
    throw new Error(`Paper trade blocked because the live price moved ${priceDriftPercent.toFixed(2)}% from the planned entry.`);
  }
  if (plan.signalKey) {
    const existingSignalTrade = await prisma.paperTrade.findFirst({ where: { assetType: plan.assetType, signalKey: plan.signalKey } });
    if (existingSignalTrade?.status === "Open") return existingSignalTrade;
    if (existingSignalTrade) throw new Error(`${plan.ticker} has already used this signal.`);
  }

  const existingOpenTicker = await prisma.paperTrade.findFirst({ where: { assetType: plan.assetType, ticker: plan.ticker, status: "Open" } });
  if (existingOpenTicker) return existingOpenTicker;
  await assertTickerReentryAllowed(assetType, plan.ticker);

  const committeeReview = await evaluateAndRecordTradeCommittee({
    assetType,
    plan,
    stock: liveAsset,
    liveStrategy: {
      score: liveSetup.score,
      actionable: liveSetup.actionable,
      strategyName: liveSetup.strategyName,
      strategyVersion: liveSetup.strategyVersion
    }
  });
  if (committeeReview.committee.decision !== "APPROVE_PAPER") {
    throw new Error(`Professional trade committee ${committeeReview.committee.decision.toLowerCase()}: ${committeeReview.committee.reasons[0] ?? "approval threshold not reached"}`);
  }

  const actualStopLoss = liveSetup.riskPlan.stopLoss;
  const baseRiskPerShare = Math.max(0.000001, liveAsset.price - actualStopLoss);
  const riskCappedAtQuote = Math.floor(plan.maxLoss / baseRiskPerShare);
  const committeeQuantity = Math.max(1, Math.floor(plan.quantity * committeeReview.committee.positionSizeMultiplier));
  let requestedQuantity = Math.max(0, Math.min(plan.quantity, riskCappedAtQuote, committeeQuantity));
  if (requestedQuantity < 1) throw new Error("Paper trade blocked because professional position sizing produced no executable quantity.");

  let execution = simulateProfessionalFill({
    side: "BUY",
    referencePrice: liveAsset.price,
    quantity: requestedQuantity,
    asset: liveAsset,
    ...professionalExecutionConfigFromEnv(),
    seed: `entry:${plan.id}:${liveAsset.quoteUpdatedAt ?? Date.now()}`
  });
  if (["D", "F"].includes(execution.qualityGrade)) {
    throw new Error(`Paper trade blocked because simulated execution quality is ${execution.qualityGrade}: ${execution.warnings[0] ?? "excessive spread or slippage"}`);
  }
  if (execution.fillPrice > liveSetup.riskPlan.maxEntryPrice) {
    throw new Error(`Paper trade blocked because the simulated fill ${execution.fillPrice} exceeds the maximum entry ${liveSetup.riskPlan.maxEntryPrice}.`);
  }

  let actualRiskPerShare = Math.max(0.000001, execution.fillPrice - actualStopLoss);
  const finalRiskCappedQuantity = Math.floor(plan.maxLoss / actualRiskPerShare);
  if (finalRiskCappedQuantity < execution.filledQuantity) {
    requestedQuantity = finalRiskCappedQuantity;
    if (requestedQuantity < 1) throw new Error("Paper trade blocked because spread and slippage would exceed the maximum planned loss.");
    execution = simulateProfessionalFill({
      side: "BUY",
      referencePrice: liveAsset.price,
      quantity: requestedQuantity,
      asset: liveAsset,
      ...professionalExecutionConfigFromEnv(),
      seed: `entry:${plan.id}:${liveAsset.quoteUpdatedAt ?? Date.now()}:risk-adjusted`
    });
    actualRiskPerShare = Math.max(0.000001, execution.fillPrice - actualStopLoss);
  }

  const actualEntryPrice = execution.fillPrice;
  const actualQuantity = execution.filledQuantity;
  const actualTakeProfit = liveSetup.riskPlan.takeProfit;
  const liveRiskReward = (actualTakeProfit - actualEntryPrice) / actualRiskPerShare;
  if (liveRiskReward < 2) throw new Error(`Paper trade blocked because simulated execution reduces reward/risk to ${liveRiskReward.toFixed(2)}.`);
  const actualPositionSize = Number((actualEntryPrice * actualQuantity + execution.fee).toFixed(2));
  const initialProfitLoss = Number((((liveAsset.price - actualEntryPrice) * actualQuantity) - execution.fee).toFixed(2));
  const initialProfitLossPercent = Number(((initialProfitLoss / Math.max(0.01, actualPositionSize)) * 100).toFixed(2));

  const trade = await prisma.$transaction(async (tx) => {
    const account = await reconcilePaperAccount(tx, { createSnapshot: false });
    if (actualPositionSize > account.availableCash) {
      throw new Error(`Paper account has only ${account.currency} ${account.availableCash.toFixed(2)} available. Simulated position cost is ${account.currency} ${actualPositionSize.toFixed(2)}.`);
    }

    if (plan.signalKey) {
      const existingSignalTrade = await tx.paperTrade.findFirst({ where: { assetType: plan.assetType, signalKey: plan.signalKey } });
      if (existingSignalTrade) return existingSignalTrade;
    }
    const existingOpenTrade = await tx.paperTrade.findFirst({ where: { assetType: plan.assetType, ticker: plan.ticker, status: "Open" } });
    if (existingOpenTrade) return existingOpenTrade;

    await tx.tradePlan.update({
      where: { id: plan.id },
      data: {
        status: "Approved Demo Trade",
        entryPrice: actualEntryPrice,
        positionSize: actualPositionSize,
        stopLoss: actualStopLoss,
        takeProfit: actualTakeProfit,
        quantity: actualQuantity,
        maxLoss: Number((actualRiskPerShare * actualQuantity + execution.fee).toFixed(2)),
        riskRewardRatio: Number(liveRiskReward.toFixed(2))
      }
    });

    const created = await tx.paperTrade.create({
      data: {
        assetType: plan.assetType,
        ticker: plan.ticker,
        entryPrice: actualEntryPrice,
        currentPrice: liveAsset.price,
        quantity: actualQuantity,
        positionSize: actualPositionSize,
        stopLoss: actualStopLoss,
        takeProfit: actualTakeProfit,
        profitLoss: initialProfitLoss,
        profitLossPercent: initialProfitLossPercent,
        entryFee: execution.fee,
        entrySlippage: execution.slippageAmount,
        executionModel: execution.modelVersion,
        status: "Open",
        tradePlanId: plan.id,
        signalKey: plan.signalKey,
        analysisId: plan.analysisId
      }
    });
    await tx.executionSimulation.create({
      data: {
        paperTradeId: created.id,
        assetType,
        ticker: plan.ticker,
        side: execution.side,
        requestedPrice: execution.requestedPrice,
        requestedQuantity: execution.requestedQuantity,
        filledQuantity: execution.filledQuantity,
        partialFill: execution.partialFill,
        fillPrice: execution.fillPrice,
        estimatedBid: execution.estimatedBid,
        estimatedAsk: execution.estimatedAsk,
        spreadBps: execution.spreadBps,
        slippageBps: execution.slippageBps,
        totalExecutionBps: execution.totalExecutionBps,
        slippageAmount: execution.slippageAmount,
        fee: execution.fee,
        latencyMs: execution.latencyMs,
        participationRate: execution.participationRate,
        qualityGrade: execution.qualityGrade,
        modelVersion: execution.modelVersion,
        warningsJson: JSON.stringify(execution.warnings)
      }
    });
    await registerPaperTradeOpened(tx, created);
    return created;
  });

  await linkDecisionToPaperTrade(committeeReview.record.id, trade.id);
  return trade;
}

export async function closePaperTrade(
  id: string,
  exitPrice?: number,
  status = "Closed",
  executionStock?: MockStock
) {
  const trade = await prisma.paperTrade.findUnique({ where: { id } });
  if (!trade) throw new Error("Paper trade not found.");
  if (trade.status !== "Open") return trade;

  const referenceExit = exitPrice ?? trade.currentPrice;
  if (!Number.isFinite(referenceExit) || referenceExit <= 0) throw new Error("Exit price must be a positive number.");

  const execution = executionStock
    ? simulateProfessionalFill({
        side: "SELL",
        referencePrice: referenceExit,
        quantity: trade.quantity,
        asset: executionStock,
        ...professionalExecutionConfigFromEnv(),
        seed: `exit:${trade.id}:${executionStock.quoteUpdatedAt ?? Date.now()}:${status}`
      })
    : null;
  const finalExit = execution?.fillPrice ?? referenceExit;
  const exitFee = execution?.fee ?? 0;
  const exitSlippage = execution?.slippageAmount ?? 0;
  const initialCost = trade.entryPrice * trade.quantity + trade.entryFee;
  const profitLoss = Number((((finalExit - trade.entryPrice) * trade.quantity) - trade.entryFee - exitFee).toFixed(2));
  const profitLossPercent = Number(((profitLoss / Math.max(0.01, initialCost)) * 100).toFixed(2));

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paperTrade.update({
      where: { id },
      data: {
        exitPrice: finalExit,
        currentPrice: finalExit,
        profitLoss,
        profitLossPercent,
        exitFee,
        exitSlippage,
        executionModel: execution?.modelVersion ?? trade.executionModel,
        status,
        closedAt: new Date()
      }
    });

    if (execution) {
      await tx.executionSimulation.create({
        data: {
          paperTradeId: trade.id,
          assetType: normalizeAssetType(trade.assetType),
          ticker: trade.ticker,
          side: execution.side,
          requestedPrice: execution.requestedPrice,
          requestedQuantity: execution.requestedQuantity,
          filledQuantity: execution.filledQuantity,
          partialFill: execution.partialFill,
          fillPrice: execution.fillPrice,
          estimatedBid: execution.estimatedBid,
          estimatedAsk: execution.estimatedAsk,
          spreadBps: execution.spreadBps,
          slippageBps: execution.slippageBps,
          totalExecutionBps: execution.totalExecutionBps,
          slippageAmount: execution.slippageAmount,
          fee: execution.fee,
          latencyMs: execution.latencyMs,
          participationRate: execution.participationRate,
          qualityGrade: execution.qualityGrade,
          modelVersion: execution.modelVersion,
          warningsJson: JSON.stringify(execution.warnings)
        }
      });
    }

    await registerPaperTradeClosed(tx, updated, status);
    return updated;
  });
}

/**
 * User-facing close action. The client cannot choose the execution price; the
 * backend fetches a fresh quote from an approved provider and enforces market hours.
 */
export async function closePaperTradeAtMarket(id: string, status = "manual_close") {
  const trade = await prisma.paperTrade.findUnique({ where: { id } });
  if (!trade) throw new Error("Paper trade not found.");
  if (trade.status !== "Open") return trade;

  const { liveAsset } = await getExecutableQuoteForTrade(trade);
  return closePaperTrade(id, liveAsset.price, status || "manual_close", liveAsset);
}

export async function updatePaperTradePrice(id: string, currentPrice: number) {
  const trade = await prisma.paperTrade.findUnique({ where: { id } });
  if (!trade) {
    throw new Error("Paper trade not found.");
  }

  if (trade.status !== "Open") return trade;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error("Current price must be a positive number.");
  const initialCost = trade.entryPrice * trade.quantity + trade.entryFee;
  const profitLoss = Number((((currentPrice - trade.entryPrice) * trade.quantity) - trade.entryFee).toFixed(2));
  const profitLossPercent = Number(((profitLoss / Math.max(0.01, initialCost)) * 100).toFixed(2));

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paperTrade.update({
      where: { id },
      data: {
        currentPrice,
        profitLoss,
        profitLossPercent
      }
    });
    await registerPaperTradePriceUpdate(tx, updated);
    return updated;
  });
}

/** User-facing refresh action; ignores any client-supplied price. */
export async function refreshPaperTradeFromMarket(id: string) {
  const trade = await prisma.paperTrade.findUnique({ where: { id } });
  if (!trade) throw new Error("Paper trade not found.");
  if (trade.status !== "Open") return trade;

  const { liveAsset } = await getExecutableQuoteForTrade(trade);
  return updatePaperTradePrice(id, liveAsset.price);
}
