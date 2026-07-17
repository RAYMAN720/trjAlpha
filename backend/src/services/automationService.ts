import { randomUUID } from "node:crypto";
import cron from "node-cron";
import type { MarketSignal } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { createAlert } from "./alertService.js";
import {
  decisionAgent,
  fundamentalAgent,
  marketScannerAgent,
  newsAgent,
  paperTradingAgent,
  recordAgentError,
  technicalAgent
} from "./agentService.js";
import { analyzeCandidate } from "./ai/fallbackRouter.js";
import { getAIConfig } from "./ai/config.js";
import { buildCandidateContext, generateResearchReport } from "./aiService.js";
import { assetTypeForMarket, marketDataProvider, normalizeAssetType, type AssetType, type MarketMode } from "./marketDataProvider.js";
import { getTradingSessionKey, getTradingSessionStart, getUsEquityMarketClock } from "./marketClockService.js";
import { checkQuoteForExecution } from "./marketSafetyService.js";
import { reconcilePaperAccount } from "./paperAccountService.js";
import { evaluatePaperTradeRisk } from "./riskEngineService.js";
import { getLatestScan, runMarketScan } from "./scannerService.js";
import { approveDemoTrade, closePaperTrade, generateTradePlan, updatePaperTradePrice } from "./tradePlanService.js";
import { calculateStrategyPerformance, calculateStrategyPerformanceByName, updatePredictionOutcomes } from "./learningService.js";
import { runTrendBreakoutBacktest } from "./strategy/trendBreakoutBacktestService.js";
import { TREND_BREAKOUT_STRATEGY_NAME, atr, ema } from "./strategy/trendBreakoutStrategy.js";
import { submitBrokerOrderFromTradePlan } from "./brokerService.js";
import { getOrCreateUserSettings } from "./userSettingsService.js";
import { openShadowTrade, refreshShadowTrades } from "./professional/shadowStrategyService.js";

const jobCadence: Record<string, { cadence: string; minutes: number; schedule: string }> = {
  marketScanJob: { cadence: "Every 15 minutes in development", minutes: 15, schedule: "*/15 * * * *" },
  newsScanJob: { cadence: "Every 30 minutes", minutes: 30, schedule: "*/30 * * * *" },
  aiResearchJob: { cadence: "Every 20 minutes", minutes: 20, schedule: "*/20 * * * *" },
  paperTradeUpdateJob: { cadence: "Every 5 minutes", minutes: 5, schedule: "*/5 * * * *" },
  riskCheckJob: { cadence: "Every 10 minutes", minutes: 10, schedule: "*/10 * * * *" },
  dailyReviewJob: { cadence: "Daily at 21:10", minutes: 24 * 60, schedule: "10 21 * * *" },
  weeklyLearningJob: { cadence: "Monday at 08:00", minutes: 7 * 24 * 60, schedule: "0 8 * * 1" }
};

const runningJobs = new Set<string>();
const scheduled = new Set<string>();
const workerOwner = `${process.pid}-${randomUUID()}`;

function nextRunFor(jobName: string) {
  const minutes = jobCadence[jobName]?.minutes ?? 15;
  return new Date(Date.now() + minutes * 60_000);
}

async function updateJob(
  jobName: string,
  status: string,
  data: {
    summary?: string;
    error?: string | null;
    ran?: boolean;
  } = {}
) {
  const existing = await prisma.scannerJob.findUnique({ where: { name: jobName } });
  const runCount = data.ran ? (existing?.runCount ?? 0) + 1 : (existing?.runCount ?? 0);

  return prisma.scannerJob.upsert({
    where: { name: jobName },
    update: {
      status,
      runCount,
      lastRunAt: data.ran ? new Date() : existing?.lastRunAt,
      nextRunAt: nextRunFor(jobName),
      lastSummary: data.summary ?? existing?.lastSummary,
      lastError: data.error === undefined ? existing?.lastError : data.error
    },
    create: {
      name: jobName,
      status,
      cadence: jobCadence[jobName]?.cadence ?? "Manual",
      runCount,
      lastRunAt: data.ran ? new Date() : undefined,
      nextRunAt: nextRunFor(jobName),
      lastSummary: data.summary,
      lastError: data.error ?? undefined
    }
  });
}

async function runJob(jobName: string, handler: () => Promise<string>) {
  if (runningJobs.has(jobName)) {
    return `${jobName} already running.`;
  }

  const lockAcquired = await acquireJobLock(jobName);
  if (!lockAcquired) {
    return `${jobName} already running in another worker.`;
  }

  runningJobs.add(jobName);
  await updateJob(jobName, "Running", { error: null });
  await heartbeatJobLock(jobName, "Running");

  try {
    const summary = await handler();
    await updateJob(jobName, "Idle", { summary, error: null, ran: true });
    await heartbeatJobLock(jobName, "Idle");
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown job error";
    await updateJob(jobName, "Error", { summary: "Job failed.", error: message, ran: true });
    await heartbeatJobLock(jobName, "Error");
    return `${jobName} failed: ${message}`;
  } finally {
    await releaseJobLock(jobName).catch(() => undefined);
    runningJobs.delete(jobName);
  }
}

function jobLockTtl(jobName: string) {
  const minutes = Math.max(3, Math.min(30, jobCadence[jobName]?.minutes ?? 10));
  return new Date(Date.now() + minutes * 60_000);
}

async function acquireJobLock(jobName: string) {
  const lockedUntil = jobLockTtl(jobName);
  try {
    await prisma.workerLock.create({
      data: {
        name: jobName,
        owner: workerOwner,
        status: "Running",
        heartbeatAt: new Date(),
        lockedUntil
      }
    });
    return true;
  } catch {
    const result = await prisma.workerLock.updateMany({
      where: {
        name: jobName,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }]
      },
      data: {
        owner: workerOwner,
        status: "Running",
        heartbeatAt: new Date(),
        lockedUntil
      }
    });
    return result.count > 0;
  }
}

async function heartbeatJobLock(jobName: string, status: string) {
  await prisma.workerLock.upsert({
    where: { name: jobName },
    update: {
      owner: workerOwner,
      status,
      heartbeatAt: new Date(),
      lockedUntil: status === "Running" ? jobLockTtl(jobName) : null
    },
    create: {
      name: jobName,
      owner: workerOwner,
      status,
      heartbeatAt: new Date(),
      lockedUntil: status === "Running" ? jobLockTtl(jobName) : null
    }
  });
}

async function releaseJobLock(jobName: string) {
  await prisma.workerLock.updateMany({
    where: { name: jobName, owner: workerOwner },
    data: {
      status: "Idle",
      lockedUntil: null,
      heartbeatAt: new Date()
    }
  });
}

const automationMarkets: MarketMode[] = ["stocks", "crypto"];

async function stockForSignal(signal: Pick<MarketSignal, "ticker">, market: MarketMode = "stocks") {
  return marketDataProvider.getStock(signal.ticker, market);
}

async function saveSnapshot(signal: MarketSignal, market: MarketMode) {
  const stock = await stockForSignal(signal, market);
  if (!stock) return;
  const assetType = assetTypeForMarket(market);

  await prisma.marketSnapshot.create({
    data: {
      assetType,
      ticker: stock.ticker,
      companyName: stock.companyName,
      sector: stock.sector,
      price: stock.price,
      previousClose: stock.previousClose,
      volume: stock.volume,
      avgVolume: stock.avgVolume,
      relativeVolume: signal.relativeVolume,
      dailyChangePercent: signal.dailyChangePercent,
      signalType: signal.signalType,
      score: signal.score,
      riskLevel: signal.riskLevel
    }
  });
}

export async function marketScanJob() {
  return runJob("marketScanJob", async () => {
    let totalScanned = 0;
    let totalSignals = 0;

    for (const market of automationMarkets) {
      const assetType = assetTypeForMarket(market);
      const scan = await runMarketScan({ market });
      totalScanned += scan.totalScanned;
      totalSignals += scan.signals.length;

      for (const signal of scan.signals) {
        await saveSnapshot(signal, market);
        await marketScannerAgent({ ...signal, assetType }, "marketScanJob");
        if (signal.score >= 80) {
          await createAlert({
            assetType,
            ticker: signal.ticker,
            alertType: "new high-score opportunity",
            severity: signal.riskLevel === "High" ? "Warning" : "Info",
            message: `${signal.ticker} scored ${signal.score}. Research candidate only; no guaranteed signal.`
          });
        }
      }
    }

    return `Scanned ${totalScanned} stock and crypto assets and ranked ${totalSignals} candidates.`;
  });
}

export async function newsScanJob() {
  return runJob("newsScanJob", async () => {
    let count = 0;

    for (const market of automationMarkets) {
      const latest = await getLatestScan(market);
      const signals = latest?.signals.slice(0, 10) ?? [];

      for (const signal of signals) {
        const stock = await stockForSignal(signal, market);
        if (!stock) continue;
        await newsAgent(stock, "newsScanJob");
        count += 1;
      }
    }

    return `News agent reviewed ${count} top candidates.`;
  });
}

export async function aiResearchJob() {
  return runJob("aiResearchJob", async () => {
    let reports = 0;

    for (const market of automationMarkets) {
      const assetType = assetTypeForMarket(market);
      const latest = await getLatestScan(market);
      const signals = latest?.signals.slice(0, 10) ?? [];

      for (const signal of signals) {
        const stock = await stockForSignal(signal, market);
        if (!stock) continue;

        try {
          await fundamentalAgent(stock, "aiResearchJob");
          await technicalAgent(signal, "aiResearchJob");
          const decision = await decisionAgent(
            {
              ticker: signal.ticker,
              score: signal.score,
              riskLevel: signal.riskLevel,
              signalType: signal.signalType
            },
            "aiResearchJob"
          );
          const report = await generateResearchReport(stock, signal);
          const savedReport = await prisma.researchReport.create({
            data: {
              assetType,
              ticker: report.ticker.toUpperCase(),
              companyName: report.companyName,
              summary: report.summary,
              whyDetected: report.whyDetected,
              bullCase: report.bullCase,
              bearCase: report.bearCase,
              risks: report.risks,
              fundamentals: report.fundamentals,
              valuationComment: report.valuationComment,
              technicalPicture: report.technicalPicture,
              catalysts: report.catalysts,
              aiScore: report.aiScore,
              confidence: report.confidence,
              riskLevel: report.riskLevel,
              decision: report.decision,
              sourcesJson: JSON.stringify(report.sources),
              scoreBreakdownJson: report.scoreBreakdownJson,
              checklistJson: report.checklistJson,
              strategyName: report.strategyName,
              strategyStatus: report.strategyStatus,
              researchQuality: report.researchQuality,
              noTradeReasonsJson: report.noTradeReasonsJson,
              evidenceJson: report.evidenceJson,
              strategyProofJson: report.strategyProofJson,
              dataSource: report.dataSource,
              catalystSource: report.catalystSource,
              priceDataSource: report.priceDataSource,
              researchProvider: report.researchProvider,
              aiProviderUsed: report.aiProviderUsed,
              confidenceQuality: report.confidenceQuality,
              limitationsJson: report.limitationsJson,
              aiMode: report.aiMode
            }
          });

          await prisma.aIPrediction.create({
            data: {
              assetType,
              ticker: stock.ticker,
              signalType: signal.signalType,
              sector: stock.sector,
              predictedScore: report.aiScore,
              confidence: report.confidence,
              decision: report.decision,
              riskLevel: report.riskLevel,
              entryPrice: stock.price,
              researchReportId: savedReport.id
            }
          });

          await prisma.decisionScore.create({
            data: {
              assetType,
              ticker: stock.ticker,
              signalType: signal.signalType,
              sector: stock.sector,
              baseScore: signal.score,
              adjustedScore: decision.adjustedScore,
              confidence: decision.confidence,
              decision: decision.finalDecision,
              riskLevel: signal.riskLevel,
              scoringJson: JSON.stringify({ signal, decision })
            }
          });

          reports += 1;
        } catch (error) {
          await recordAgentError({
            assetType,
            agentName: "aiResearchJob",
            jobName: "aiResearchJob",
            inputTicker: signal.ticker,
            inputJson: signal,
            error
          });
        }
      }
    }

    return `Generated ${reports} automatic research reports.`;
  });
}

function stopLossStatus(status: string) {
  const normalized = status.toLowerCase().replaceAll("_", "-");
  return normalized.includes("stop-loss") || normalized.includes("stop loss");
}

async function recordSkippedExecution(assetType: AssetType, ticker: string, reason: string, rule: string) {
  await prisma.riskEvent.create({
    data: {
      assetType,
      ticker,
      rule,
      severity: "Warning",
      blocked: true,
      message: reason,
      contextJson: JSON.stringify({ ticker, assetType, reason, checkedAt: new Date().toISOString() })
    }
  });
}

async function closeIfNeeded(trade: Awaited<ReturnType<typeof prisma.paperTrade.findMany>>[number]) {
  const assetType = normalizeAssetType(trade.assetType);
  const market = assetType === "crypto" ? "crypto" : "stocks";
  const asset = await marketDataProvider.getStock(trade.ticker, market);
  const quoteCheck = checkQuoteForExecution(asset, assetType, { requireOpenMarket: assetType === "stock" });
  if (!quoteCheck.executable || !asset) {
    await recordSkippedExecution(assetType, trade.ticker, quoteCheck.reason, "paper_trade_price_update_blocked");
    return { updated: false, closed: false, reason: quoteCheck.reason };
  }

  const currentPrice = asset.price;
  const updated = await updatePaperTradePrice(trade.id, currentPrice);
  if (currentPrice <= trade.stopLoss) {
    const closed = await closePaperTrade(trade.id, currentPrice, "Stop-loss hit", asset);
    await prisma.paperTradeEvent.create({
      data: {
        assetType,
        paperTradeId: trade.id,
        ticker: trade.ticker,
        eventType: "stop-loss hit",
        price: currentPrice,
        profitLoss: closed.profitLoss,
        message: `${trade.ticker} paper trade hit stop-loss using ${asset.quoteSource}.`
      }
    });
    await createAlert({ assetType, ticker: trade.ticker, alertType: "stop-loss hit", severity: "Warning", message: `${trade.ticker} paper stop-loss hit at live price ${currentPrice}.` });
    return { updated: true, closed: true, reason: "stop-loss" };
  }

  if (assetType === "stock") {
    const daily = await marketDataProvider.getChart(trade.ticker, "stocks", "daily");
    const atr14 = atr(daily, 14);
    const initialRisk = Math.max(0.01, (trade.takeProfit - trade.entryPrice) / 2.5);
    let ratchetedStop = trade.stopLoss;
    if (currentPrice >= trade.entryPrice + initialRisk) {
      ratchetedStop = Math.max(ratchetedStop, trade.entryPrice * 1.001);
    }
    if (atr14 > 0 && currentPrice >= trade.entryPrice + initialRisk * 1.5) {
      ratchetedStop = Math.max(ratchetedStop, currentPrice - atr14 * 1.2);
    }
    ratchetedStop = Math.min(ratchetedStop, currentPrice - Math.max(0.01, atr14 * 0.1));
    if (ratchetedStop > trade.stopLoss) {
      await prisma.paperTrade.update({ where: { id: trade.id }, data: { stopLoss: Number(ratchetedStop.toFixed(currentPrice >= 1 ? 2 : 6)) } });
      await prisma.paperTradeEvent.create({
        data: {
          assetType,
          paperTradeId: trade.id,
          ticker: trade.ticker,
          eventType: "trailing stop raised",
          price: ratchetedStop,
          profitLoss: updated.profitLoss,
          message: `${trade.ticker} stop ratcheted to ${ratchetedStop.toFixed(2)} after Trend Breakout V2 profit confirmation.`
        }
      });
    }

    const latestDailyClose = daily.at(-1)?.close ?? currentPrice;
    const dailyEma20 = ema(daily.slice(-100).map((candle) => candle.close), 20);
    const ageDays = (Date.now() - trade.openedAt.getTime()) / (24 * 60 * 60_000);
    if (ageDays >= 3 && dailyEma20 > 0 && latestDailyClose < dailyEma20) {
      const closed = await closePaperTrade(trade.id, currentPrice, "Trend exit below EMA20", asset);
      return { updated: true, closed: true, reason: `trend-exit:${closed.status}` };
    }
    if (ageDays >= 21) {
      const closed = await closePaperTrade(trade.id, currentPrice, "Maximum holding period exit", asset);
      return { updated: true, closed: true, reason: `time-exit:${closed.status}` };
    }
  }

  if (currentPrice >= trade.takeProfit) {
    const closed = await closePaperTrade(trade.id, currentPrice, "Take-profit hit", asset);
    await prisma.paperTradeEvent.create({
      data: {
        assetType,
        paperTradeId: trade.id,
        ticker: trade.ticker,
        eventType: "take-profit hit",
        price: currentPrice,
        profitLoss: closed.profitLoss,
        message: `${trade.ticker} paper trade hit take-profit using ${asset.quoteSource}.`
      }
    });
    await createAlert({ assetType, ticker: trade.ticker, alertType: "take-profit hit", severity: "Info", message: `${trade.ticker} paper take-profit hit at live price ${currentPrice}.` });
    return { updated: true, closed: true, reason: "take-profit" };
  }

  return { updated: Boolean(updated), closed: false, reason: "live-price-update" };
}

async function tickerEntryBlockReason(assetType: AssetType, ticker: string, now = new Date()) {
  const sessionStart = getTradingSessionStart(assetType, now);
  const alreadyTradedThisSession = await prisma.paperTrade.findFirst({
    where: { assetType, ticker, openedAt: { gte: sessionStart } },
    orderBy: { openedAt: "desc" }
  });
  if (alreadyTradedThisSession) return `${ticker} has already been traded in the current session.`;

  const cooldownHours = Math.max(1, Number(process.env.STOP_LOSS_REENTRY_COOLDOWN_HOURS ?? 24));
  const recentTrades = await prisma.paperTrade.findMany({
    where: { assetType, ticker, closedAt: { gte: new Date(now.getTime() - cooldownHours * 60 * 60_000) } },
    orderBy: { closedAt: "desc" },
    take: 10
  });
  if (recentTrades.some((trade) => stopLossStatus(trade.status))) {
    return `${ticker} is in a ${cooldownHours}-hour cooldown after a stop-loss.`;
  }
  return null;
}

export async function paperTradeUpdateJob() {
  return runJob("paperTradeUpdateJob", async () => {
    const aiConfig = getAIConfig();
    const user = await getOrCreateUserSettings();
    const shadowRefresh = await refreshShadowTrades().catch(() => ({ checked: 0, updated: 0, closed: 0 }));
    const openTrades = await prisma.paperTrade.findMany({ where: { status: "Open" } });
    let updatedCount = 0;
    let closedCount = 0;
    let blockedUpdates = 0;
    for (const trade of openTrades) {
      const result = await closeIfNeeded(trade);
      if (result.updated) updatedCount += 1;
      if (result.closed) closedCount += 1;
      if (!result.updated) blockedUpdates += 1;
    }
    await reconcilePaperAccount(undefined, { createSnapshot: updatedCount > 0 || closedCount > 0 });

    if (!aiConfig.paperTradingEnabled) {
      return `Updated ${updatedCount} open paper trades; ${blockedUpdates} updates blocked by market-data safeguards. New paper trading is disabled by PAPER_TRADING_ENABLED=false.`;
    }
    if (!user.autoPaperTrading) {
      return `Updated ${updatedCount} open paper trades; ${blockedUpdates} updates blocked by market-data safeguards. Auto paper trading is off.`;
    }

    let opened = 0;
    let blockedEntries = 0;
    for (const market of automationMarkets) {
      const assetType = assetTypeForMarket(market);
      if (assetType === "stock" && !getUsEquityMarketClock().open) continue;
      const latest = await getLatestScan(market);
      const candidates = latest?.signals.slice(0, 10) ?? [];

      for (const signal of candidates) {
        const sessionKey = getTradingSessionKey(assetType);
        const signalKey = `${assetType}:${signal.ticker}:${sessionKey}:${signal.signalType}`;
        const openCount = await prisma.paperTrade.count({ where: { assetType, status: "Open" } });
        if (openCount >= user.maxOpenTrades) break;

        const existingSignalTrade = await prisma.paperTrade.findFirst({ where: { assetType, signalKey } });
        if (existingSignalTrade) continue;
        const existing = await prisma.paperTrade.findFirst({ where: { assetType, ticker: signal.ticker, status: "Open" } });
        if (existing) continue;
        const entryBlock = await tickerEntryBlockReason(assetType, signal.ticker);
        if (entryBlock) {
          blockedEntries += 1;
          await recordSkippedExecution(assetType, signal.ticker, entryBlock, "ticker_reentry_guard");
          continue;
        }

        const stock = await marketDataProvider.getStock(signal.ticker, market);
        const quoteCheck = checkQuoteForExecution(stock, assetType, { requireOpenMarket: assetType === "stock" });
        if (!stock || !quoteCheck.executable) {
          blockedEntries += 1;
          await recordSkippedExecution(assetType, signal.ticker, quoteCheck.reason, "entry_quote_guard");
          continue;
        }

        const risk = await evaluatePaperTradeRisk({ assetType, stock, score: signal.score, riskLevel: signal.riskLevel, jobName: "paperTradeUpdateJob" });
        if (risk.blocked) continue;
        const context = await buildCandidateContext(stock, signal);
        const analysis = await analyzeCandidate(context);
        if (analysis.recommendation === "reject") {
          await createAlert({
            assetType,
            ticker: stock.ticker,
            alertType: "research warning",
            severity: "Info",
            message: `${stock.ticker} received an AI caution. Trend Breakout V2 and deterministic risk controls remain authoritative.`
          });
        }
        if (analysis.technicalOnly && !aiConfig.technicalFallbackEnabled) continue;

        const plan = await generateTradePlan({
          assetType,
          ticker: stock.ticker,
          currentPrice: stock.price,
          aiScore: signal.score,
          riskLevel: signal.riskLevel,
          dailyChangePercent: stock.dailyChangePercent,
          signalKey,
          analysisId: analysis.id
        });
        const postPlanRisk = await evaluatePaperTradeRisk({ assetType, stock, score: signal.score, riskLevel: signal.riskLevel, plan, jobName: "paperTradeUpdateJob" });
        if (postPlanRisk.blocked || plan.status === "Watchlist Only") {
          if (plan.quantity > 0 && signal.score >= 75) {
            await openShadowTrade({
              assetType,
              stock,
              strategyName: plan.strategyName,
              stopLoss: plan.stopLoss,
              takeProfit: plan.takeProfit,
              committeeScore: signal.score,
              reason: postPlanRisk.blocked ? "Risk engine blocked active paper execution." : "Plan retained on the professional watchlist.",
              context: { signalKey, tradePlanId: plan.id, postPlanRisk, planStatus: plan.status }
            }).catch(() => null);
          }
          continue;
        }

        try {
          const trade = await approveDemoTrade(plan.id);
          if (analysis.id) await prisma.aIAnalysis.update({ where: { id: analysis.id }, data: { tradeId: trade.id } });
          if (process.env.AUTO_SUBMIT_BROKER_PAPER_ORDERS === "true") await submitBrokerOrderFromTradePlan(plan.id);
          await paperTradingAgent({ assetType, ticker: stock.ticker, action: "Opened paper trade", reason: `Passed the professional committee and execution simulation with ${stock.quoteSource}.` }, "paperTradeUpdateJob");
          await prisma.paperTradeEvent.create({
            data: {
              assetType,
              paperTradeId: trade.id,
              ticker: trade.ticker,
              eventType: "paper trade opened",
              price: trade.entryPrice,
              profitLoss: trade.profitLoss,
              message: `${trade.ticker} paper trade opened after committee approval and a professional simulated fill.`
            }
          });
          await createAlert({ assetType, ticker: trade.ticker, alertType: "paper trade opened", severity: "Info", message: `${trade.ticker} automatic paper trade opened after professional committee approval.` });
          opened += 1;
        } catch (error) {
          blockedEntries += 1;
          const message = error instanceof Error ? error.message : String(error);
          await recordSkippedExecution(assetType, stock.ticker, message, "professional_trade_committee");
          const decision = await prisma.professionalDecisionRecord.findFirst({ where: { tradePlanId: plan.id }, orderBy: { createdAt: "desc" } }).catch(() => null);
          if (decision && decision.committeeScore >= 65) {
            await openShadowTrade({
              assetType,
              stock,
              strategyName: decision.strategyName,
              strategyVersion: decision.strategyVersion,
              stopLoss: plan.stopLoss,
              takeProfit: plan.takeProfit,
              committeeScore: decision.committeeScore,
              reason: `Active paper execution rejected: ${message}`,
              sourceDecisionId: decision.id,
              context: { signalKey, tradePlanId: plan.id, decision: decision.decision }
            }).catch(() => null);
          }
        }
      }
    }

    await reconcilePaperAccount(undefined, { createSnapshot: opened > 0 });
    return `Live update complete: ${updatedCount} updated, ${closedCount} closed, ${opened} opened, ${blockedUpdates + blockedEntries} blocked by safeguards; shadow desk ${shadowRefresh.updated} refreshed/${shadowRefresh.closed} closed.`;
  });
}

export async function riskCheckJob() {
  return runJob("riskCheckJob", async () => {
    const openTrades = await prisma.paperTrade.findMany({ where: { status: "Open" } });
    let warnings = 0;

    for (const trade of openTrades) {
      if (trade.stopLoss <= 0 || trade.takeProfit <= trade.entryPrice) {
        warnings += 1;
        await createAlert({
          assetType: normalizeAssetType(trade.assetType),
          ticker: trade.ticker,
          alertType: "risk warning",
          severity: "High",
          message: `${trade.ticker} has an invalid paper trade risk plan.`
        });
      }
    }

    return `Checked ${openTrades.length} open paper trades. Risk warnings: ${warnings}.`;
  });
}

export async function dailyReviewJob() {
  return runJob("dailyReviewJob", async () => {
    const [globalPerformance, stockPerformance, cryptoPerformance] = await Promise.all([
      calculateStrategyPerformance("dailyReviewJob"),
      calculateStrategyPerformance("dailyReviewJob", "stock"),
      calculateStrategyPerformance("dailyReviewJob", "crypto")
    ]);
    return (
      `Daily review ready. Global win rate ${globalPerformance.winRate.toFixed(1)}%, ` +
      `stock ${stockPerformance.winRate.toFixed(1)}%, crypto ${cryptoPerformance.winRate.toFixed(1)}%.`
    );
  });
}

export async function weeklyLearningJob() {
  return runJob("weeklyLearningJob", async () => {
    await updatePredictionOutcomes("stock");
    const [assetPerformance, strategyPerformance, universe] = await Promise.all([
      calculateStrategyPerformance("weeklyLearningJob", "stock"),
      calculateStrategyPerformanceByName(TREND_BREAKOUT_STRATEGY_NAME, "stock"),
      marketDataProvider.getMarketUniverse("stocks")
    ]);
    const backtest = await runTrendBreakoutBacktest(universe);
    const firstTime = backtest.trades[0]?.signalTime;
    const lastTime = backtest.trades.at(-1)?.exitTime;
    await prisma.backtestResult.create({
      data: {
        assetType: "stock",
        strategyName: TREND_BREAKOUT_STRATEGY_NAME,
        startDate: firstTime ? new Date(firstTime) : new Date(Date.now() - 365 * 24 * 60 * 60_000),
        endDate: lastTime ? new Date(lastTime) : new Date(),
        totalTrades: backtest.totalTrades,
        winRate: backtest.winRate,
        profitFactor: backtest.profitFactor,
        maxDrawdown: backtest.maxDrawdown,
        summary: JSON.stringify({
          methodology: "Walk-forward daily signal test with a shared portfolio, maximum three concurrent positions, one position per sector, next-bar entries, conservative intrabar stop priority, 8 bps slippage each side, 2 bps fees, ATR/structure stop, 2.5R target and ratcheting stop. Intraday execution is validated separately in forward paper trading.",
          expectancy: backtest.expectancy,
          averageR: backtest.averageR,
          finalBalance: backtest.finalBalance,
          paperTrades: strategyPerformance.tradeCount,
          paperProfitFactor: strategyPerformance.profitFactor
        })
      }
    });

    return `Trend Breakout V2 validation complete: ${backtest.totalTrades} historical trades, PF ${backtest.profitFactor.toFixed(2)}, max drawdown ${backtest.maxDrawdown.toFixed(2)}%, ${strategyPerformance.tradeCount} strategy paper trades. Overall stock PF ${assetPerformance.profitFactor.toFixed(2)}.`;
  });
}

export const jobHandlers: Record<string, () => Promise<string>> = {
  marketScanJob,
  newsScanJob,
  aiResearchJob,
  paperTradeUpdateJob,
  riskCheckJob,
  dailyReviewJob,
  weeklyLearningJob
};

export async function ensureAutomationJobs() {
  for (const [name, config] of Object.entries(jobCadence)) {
    await prisma.scannerJob.upsert({
      where: { name },
      update: {
        cadence: config.cadence,
        nextRunAt: nextRunFor(name)
      },
      create: {
        name,
        cadence: config.cadence,
        status: "Idle",
        nextRunAt: nextRunFor(name)
      }
    });
  }
}

export async function startAutomationWorkers() {
  if (process.env.RUN_WORKERS_ON_START === "false") {
    return;
  }

  await ensureAutomationJobs();

  for (const [jobName, config] of Object.entries(jobCadence)) {
    if (scheduled.has(jobName)) continue;
    scheduled.add(jobName);
    cron.schedule(config.schedule, () => {
      void jobHandlers[jobName]?.();
    });
  }

  void marketScanJob()
    .then(() => aiResearchJob())
    .then(() => paperTradeUpdateJob())
    .then(() => dailyReviewJob());
}

export async function getAutomationStatus() {
  await ensureAutomationJobs();
  const [jobs, latestScan, user, openTrades, alerts, workerLock] = await Promise.all([
    prisma.scannerJob.findMany({ orderBy: { name: "asc" } }),
    getLatestScan(),
    getOrCreateUserSettings(),
    prisma.paperTrade.count({ where: { status: "Open" } }),
    prisma.alert.count({ where: { active: true } }),
    prisma.workerLock.findFirst({ orderBy: { heartbeatAt: "desc" } })
  ]);

  return {
    autoScanOn: true,
    paperTradingOnly: true,
    realTradingEnabled: false,
    autoPaperTrading: user.autoPaperTrading,
    marketScannerStatus: jobs.find((job) => job.name === "marketScanJob")?.status ?? "Idle",
    lastScanTime: latestScan?.scanDate,
    nextScanTime: jobs.find((job) => job.name === "marketScanJob")?.nextRunAt,
    jobsRunning: jobs.filter((job) => job.status === "Running").map((job) => job.name),
    workerHeartbeatAt: workerLock?.heartbeatAt,
    openPaperTrades: openTrades,
    activeAlerts: alerts,
    jobs
  };
}
