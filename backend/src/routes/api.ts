import { Router } from "express";
import type { AIAnalysis } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import {
  assetTypeForMarket,
  marketDataProvider,
  normalizeMarketMode,
  type AssetType,
  type MarketMode
} from "../services/marketDataProvider.js";
import { createAlert, markAlertRead } from "../services/alertService.js";
import { generateJournalReview, generateResearchReport } from "../services/aiService.js";
import { getAIStatus } from "../services/ai/fallbackRouter.js";
import { getAssetLogo, getAssetProfile } from "../services/assets/logoService.js";
import {
  AuthCodeError,
  createAccessToken,
  requestLoginCode,
  requireAppAuth,
  verifyAccessToken,
  verifyLoginCode,
  verifyPasscode
} from "../services/authService.js";
import { getAutomationStatus, jobHandlers } from "../services/automationService.js";
import { getBenchmarkStatus } from "../services/benchmarkService.js";
import {
  getBrokerOrders,
  getBrokerStatus,
  submitBrokerOrderFromTradePlan,
  syncBrokerAccount
} from "../services/brokerService.js";
import { getDailyBriefing, buildStockMarketBriefing, buildCryptoMarketBriefing } from "../services/briefing/dailyBriefingService.js";
import { getCandles, getChartMarkers, getPositionLines } from "../services/charts/chartDataService.js";
import { getLearningSummary } from "../services/learningService.js";
import { analyzeMultiTimeframe } from "../services/multiTimeframe/multiTimeframeEngine.js";
import { collectLatestNews, getNewsStatus } from "../services/news/newsCollectorService.js";
import { getNoTradeStatus } from "../services/noTradeService.js";
import { getPaperAccountEquity, getPaperAccountSummary, resetPaperAccount } from "../services/paperAccountService.js";
import { getPlaybooksStatus } from "../services/playbooks/playbookService.js";
import { blockRealTradingAttempt } from "../services/riskEngineService.js";
import { getAdvancedRiskStatus } from "../services/risk/advancedRiskManager.js";
import { getLatestScan, getSignals, runMarketScan } from "../services/scannerService.js";
import {
  approveDemoTrade,
  closePaperTradeAtMarket,
  generateTradePlan,
  refreshPaperTradeFromMarket
} from "../services/tradePlanService.js";
import { getOrCreateUserSettings } from "../services/userSettingsService.js";
import { generateDocumentedInvestmentReport } from "../services/reportService.js";
import { generateWeeklyTraderReport } from "../services/reports/weeklyTraderReport.js";
import { getCurrentProfessionalMarketRegime, getRecentMarketRegimes } from "../services/professional/marketRegimeService.js";
import { getRecentProfessionalDecisions } from "../services/professional/professionalDecisionService.js";
import { getExecutionSimulationSummary } from "../services/professional/executionSimulationService.js";
import { getShadowStrategySummary, refreshShadowTrades } from "../services/professional/shadowStrategyService.js";
import { getTradingControl, haltNewPaperEntries, resumePaperEntries } from "../services/professional/tradingControlService.js";
import {
  getLeanEngineStatus,
  getLeanJob,
  listLeanJobs,
  startLeanPaperTrading,
  stopLeanJob,
  submitLeanBacktest
} from "../services/lean/leanEngineService.js";

export const apiRouter = Router();

function marketFromRequest(value?: unknown): MarketMode {
  return normalizeMarketMode(value);
}

function assetTypeFromMarketInput(value?: unknown): AssetType {
  return assetTypeForMarket(marketFromRequest(value));
}

function assetTypeWhere(assetType?: AssetType) {
  return assetType ? { assetType } : undefined;
}

function compactAnalysis(analysis?: AIAnalysis | null) {
  return analysis
    ? {
        id: analysis.id,
        symbol: analysis.symbol,
        provider: analysis.provider,
        model: analysis.model,
        status: analysis.status,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        sourceQuality: analysis.sourceQuality,
        fallbackUsed: analysis.fallbackUsed,
        technicalOnly: analysis.technicalOnly,
        cached: analysis.cached,
        errorCode: analysis.errorCode,
        createdAt: analysis.createdAt
      }
    : null;
}

async function enrichSignalsWithAnalyses<T extends { id: string; ticker: string }>(signals: T[]) {
  if (!signals.length) return signals.map((signal) => ({ ...signal, analysis: null }));
  const tickers = [...new Set(signals.map((signal) => signal.ticker))];
  const analyses = await prisma.aIAnalysis.findMany({
    where: {
      OR: [{ candidateId: { in: signals.map((signal) => signal.id) } }, { symbol: { in: tickers } }]
    },
    orderBy: { createdAt: "desc" }
  });

  return signals.map((signal) => ({
    ...signal,
    analysis: compactAnalysis(
      analyses.find((analysis) => analysis.candidateId === signal.id) ??
        analyses.find((analysis) => analysis.symbol === signal.ticker)
    )
  }));
}

async function getAssetDashboard(market: MarketMode) {
  const assetType = assetTypeForMarket(market);
  const [settings, scan, trades, jobs, paperAccount] = await Promise.all([
    getOrCreateUserSettings(),
    getLatestScan(market),
    prisma.paperTrade.findMany({
      where: { assetType },
      orderBy: { openedAt: "desc" }
    }),
    prisma.scannerJob.findMany({ orderBy: { name: "asc" } }),
    getPaperAccountSummary(assetType)
  ]);
  const openTrades = trades.filter((trade) => trade.status === "Open");
  const todayProfit = openTrades.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalProfit = trades.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalOpenRisk = openTrades.reduce((total, trade) => total + Math.max(0, trade.entryPrice - trade.stopLoss) * trade.quantity, 0);
  const enrichedSignals = scan ? await enrichSignalsWithAnalyses(scan.signals) : [];

  return {
    assetType,
    market,
    settings,
    scan: scan ? { ...scan, signals: enrichedSignals } : null,
    paperTradingOnly: true,
    realTradingEnabled: false,
    openPaperTrades: openTrades.length,
    totalPaperTrades: trades.length,
    todayProfit,
    totalProfit,
    totalOpenRisk,
    paperAccount: paperAccount.account,
    accountCurrency: paperAccount.account.currency,
    totalEquity: paperAccount.account.totalEquity,
    cashBalance: paperAccount.account.cashBalance,
    openPositionsValue: paperAccount.account.openPositionsValue,
    unrealizedPnL: paperAccount.account.unrealizedPnL,
    realizedPnL: paperAccount.account.realizedPnL,
    bestCandidate: enrichedSignals[0] ?? null,
    autoScannerOn: true,
    autoPaperTrading: settings.autoPaperTrading,
    lastScanTime: scan?.scanDate ?? null,
    nextScanTime: jobs.find((job) => job.name === "marketScanJob")?.nextRunAt ?? null
  };
}

async function getAssetDetailPayload(symbol: string, market: MarketMode) {
  const ticker = symbol.toUpperCase();
  const assetType = assetTypeForMarket(market);
  const mockStock = await marketDataProvider.getStock(ticker, market);
  const stock = market === "stocks" ? await prisma.stock.findUnique({ where: { ticker } }) : null;
  const signal = await prisma.marketSignal.findFirst({
    where: { ticker, assetType },
    orderBy: { createdAt: "desc" }
  });

  if (mockStock) {
    return {
      ...mockStock,
      assetType,
      relativeVolume: Number((mockStock.volume / mockStock.avgVolume).toFixed(2)),
      signal
    };
  }

  return stock ? { ...stock, assetType, signal } : null;
}

async function createTradePlanForAsset(symbol: string, market: MarketMode) {
  const ticker = symbol.toUpperCase();
  const assetType = assetTypeForMarket(market);
  const stock = await marketDataProvider.getStock(ticker, market);
  if (!stock) return null;

  const report = await prisma.researchReport.findFirst({
    where: { ticker, assetType },
    orderBy: { createdAt: "desc" }
  });
  const signal = await prisma.marketSignal.findFirst({
    where: { ticker, assetType },
    orderBy: { createdAt: "desc" }
  });

  return generateTradePlan({
    assetType,
    ticker,
    currentPrice: stock.price,
    aiScore: report?.aiScore ?? signal?.score ?? 50,
    riskLevel: report?.riskLevel ?? signal?.riskLevel ?? "Medium",
    dailyChangePercent: stock.dailyChangePercent
  });
}

async function listPaperTrades(assetType?: AssetType) {
  const trades = await prisma.paperTrade.findMany({ where: assetTypeWhere(assetType), orderBy: { openedAt: "desc" } });
  const tradeIds = trades.map((trade) => trade.id);
  const tickers = [...new Set(trades.map((trade) => trade.ticker))];
  const analyses = tradeIds.length || tickers.length
    ? await prisma.aIAnalysis.findMany({
        where: {
          OR: [{ tradeId: { in: tradeIds } }, { symbol: { in: tickers } }]
        },
        orderBy: { createdAt: "desc" }
      })
    : [];

  return trades.map((trade) => {
    const analysis =
      analyses.find((item) => item.tradeId === trade.id) ??
      (trade.analysisId ? analyses.find((item) => item.id === trade.analysisId) : undefined) ??
      analyses.find((item) => item.symbol === trade.ticker);

    return {
      ...trade,
      analysis: compactAnalysis(analysis)
    };
  });
}

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "TradePilot AI Scanner",
    mode: "PAPER_TRADING_ONLY",
    realTradingEnabled: false
  });
});

apiRouter.post("/auth/login", (req, res, next) => {
  try {
    const passcode = String(req.body.passcode ?? "");
    if (!verifyPasscode(passcode)) {
      return res.status(401).json({ error: "Incorrect passcode." });
    }

    return res.json(createAccessToken());
  } catch (error) {
    if (error instanceof AuthCodeError) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

apiRouter.post("/auth/code/request", async (_req, res, next) => {
  try {
    return res.json(await requestLoginCode());
  } catch (error) {
    if (error instanceof AuthCodeError) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

apiRouter.post("/auth/code/verify", (req, res, next) => {
  try {
    const code = String(req.body.code ?? "");
    return res.json(verifyLoginCode(code));
  } catch (error) {
    if (error instanceof AuthCodeError) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

apiRouter.get("/auth/session", (req, res) => {
  const authHeader = req.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Session expired." });
  }

  return res.json({
    ok: true,
    displayName: payload.name,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  });
});

apiRouter.use(requireAppAuth);

apiRouter.get("/system/status", async (_req, res, next) => {
  try {
    let databaseConnected = true;
    try {
      await prisma.scannerJob.count();
    } catch {
      databaseConnected = false;
    }

    const [aiStatus, automationStatus, leanEngine, lastStockScan, lastCryptoScan, lastResearch] = await Promise.all([
      getAIStatus(),
      getAutomationStatus(),
      getLeanEngineStatus(),
      getLatestScan("stocks"),
      getLatestScan("crypto"),
      prisma.researchReport.findFirst({ orderBy: { createdAt: "desc" } })
    ]);

    res.json({
      databaseConnected,
      aiProvidersConfigured: {
        openai: aiStatus.config.openaiConfigured,
        mistral: aiStatus.config.mistralConfigured,
        remoteLocal: aiStatus.config.remoteLocalConfigured,
        ollama: aiStatus.config.ollamaEnabled
      },
      activeAIMode: aiStatus.mode,
      marketDataProvider: "Alpaca/Yahoo/Binance; static fallback is display-only and blocked from execution",
      workerStatus: automationStatus.marketScannerStatus,
      lastStockScan: lastStockScan?.scanDate ?? null,
      lastCryptoScan: lastCryptoScan?.scanDate ?? null,
      lastResearchRun: lastResearch?.createdAt ?? null,
      technicalEngineStatus: "enabled",
      leanEngine,
      realTradingDisabled: true,
      paperTradingOnly: true
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/market-data/status", async (_req, res, next) => {
  try {
    const [stocks, crypto] = await Promise.all([
      marketDataProvider.getMarketUniverse("stocks"),
      marketDataProvider.getMarketUniverse("crypto")
    ]);

    res.json({
      stocks: {
        tracked: stocks.length,
        provider: stocks[0]?.quoteSource ?? "Mock/fallback stock universe",
        lastUpdated: stocks[0]?.quoteUpdatedAt ?? new Date().toISOString(),
        sample: stocks.slice(0, 5).map((stock) => ({ ticker: stock.ticker, price: stock.price, source: stock.quoteSource ?? "fallback" }))
      },
      crypto: {
        tracked: crypto.length,
        provider: crypto[0]?.quoteSource ?? "Binance/fallback crypto universe",
        lastUpdated: crypto[0]?.quoteUpdatedAt ?? new Date().toISOString(),
        sample: crypto.slice(0, 5).map((asset) => ({ ticker: asset.ticker, price: asset.price, source: asset.quoteSource ?? "fallback" }))
      }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/jobs/status", async (_req, res, next) => {
  try {
    res.json(await getAutomationStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/research/status", async (_req, res, next) => {
  try {
    const [latest, total, byQuality, byMode] = await Promise.all([
      prisma.researchReport.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.researchReport.count(),
      prisma.researchReport.groupBy({ by: ["researchQuality"], _count: { _all: true } }),
      prisma.researchReport.groupBy({ by: ["aiMode"], _count: { _all: true } })
    ]);

    res.json({
      totalReports: total,
      latestResearchRun: latest?.createdAt ?? null,
      latestTicker: latest?.ticker ?? null,
      latestQuality: latest?.researchQuality ?? null,
      qualityBreakdown: byQuality.map((row) => ({ quality: row.researchQuality, count: row._count._all })),
      aiModeBreakdown: byMode.map((row) => ({ mode: row.aiMode, count: row._count._all })),
      technicalFallbackEnabled: true,
      realTradingDisabled: true
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/briefing/daily", async (_req, res, next) => {
  try {
    res.json(await getDailyBriefing());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/briefing/stocks", async (_req, res, next) => {
  try {
    res.json(await buildStockMarketBriefing());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/briefing/crypto", async (_req, res, next) => {
  try {
    res.json(await buildCryptoMarketBriefing());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/no-trade/status", async (req, res, next) => {
  try {
    res.json(await getNoTradeStatus(normalizeMarketMode(req.query.market)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/benchmark/status", async (_req, res, next) => {
  try {
    res.json(await getBenchmarkStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/risk/status", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await getAdvancedRiskStatus(assetType));
  } catch (error) {
    next(error);
  }
});

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function presentProfessionalDecision<T extends { votesJson: string; reasonsJson: string; contextJson: string }>(decision: T) {
  let context: unknown = null;
  try {
    context = JSON.parse(decision.contextJson);
  } catch {
    context = null;
  }
  return {
    ...decision,
    votes: parseJsonArray(decision.votesJson),
    reasons: parseJsonArray(decision.reasonsJson),
    context
  };
}

apiRouter.get("/professional/desk", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : "stock";
    const [control, regime, risk, decisions, execution, shadow, recentRegimes] = await Promise.all([
      getTradingControl(),
      getCurrentProfessionalMarketRegime(assetType),
      getAdvancedRiskStatus(assetType),
      getRecentProfessionalDecisions(40, assetType),
      getExecutionSimulationSummary(100, assetType),
      getShadowStrategySummary(100, assetType),
      getRecentMarketRegimes(assetType, 20)
    ]);
    res.json({
      paperOnly: true,
      realTradingEnabled: false,
      control,
      regime,
      risk,
      decisions: decisions.map(presentProfessionalDecision),
      execution: {
        ...execution,
        recent: execution.recent.map((record) => ({ ...record, warnings: parseJsonArray(record.warningsJson) }))
      },
      shadow,
      recentRegimes
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/professional/regime", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : "stock";
    res.json(await getCurrentProfessionalMarketRegime(assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/professional/decisions", async (req, res, next) => {
  try {
    const take = Math.max(1, Math.min(300, Number(req.query.take ?? 60)));
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json((await getRecentProfessionalDecisions(take, assetType)).map(presentProfessionalDecision));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/professional/executions", async (req, res, next) => {
  try {
    const take = Math.max(1, Math.min(500, Number(req.query.take ?? 100)));
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    const summary = await getExecutionSimulationSummary(take, assetType);
    res.json({ ...summary, recent: summary.recent.map((record) => ({ ...record, warnings: parseJsonArray(record.warningsJson) })) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/professional/shadow", async (req, res, next) => {
  try {
    const take = Math.max(1, Math.min(500, Number(req.query.take ?? 100)));
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await getShadowStrategySummary(take, assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/professional/shadow/refresh", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    const refresh = await refreshShadowTrades();
    res.json({ refresh, summary: await getShadowStrategySummary(100, assetType) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/professional/control/halt", async (req, res, next) => {
  try {
    res.json(await haltNewPaperEntries(String(req.body.reason ?? "Manual professional safety halt.")));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/professional/control/resume", async (req, res, next) => {
  try {
    res.json(await resumePaperEntries(String(req.body.reason ?? "Paper-entry safety review completed.")));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/playbooks/status", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await getPlaybooksStatus(assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-account", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await getPaperAccountSummary(assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-account/equity", async (_req, res, next) => {
  try {
    res.json(await getPaperAccountEquity());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-account/snapshots", async (_req, res, next) => {
  try {
    const summary = await getPaperAccountEquity();
    res.json(summary.snapshots);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/paper-account/reset", async (_req, res, next) => {
  try {
    res.json(await resetPaperAccount());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-trades/open", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json((await listPaperTrades(assetType)).filter((trade) => trade.status === "Open"));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/paper-trades/open", async (req, res, next) => {
  try {
    res.json(await approveDemoTrade(String(req.body.tradePlanId)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-trades/closed", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json((await listPaperTrades(assetType)).filter((trade) => trade.status !== "Open"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-trades/:id/events", async (req, res, next) => {
  try {
    res.json(await prisma.paperTradeEvent.findMany({ where: { paperTradeId: req.params.id }, orderBy: { createdAt: "asc" } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/paper-trades/:id/close", async (req, res, next) => {
  try {
    res.json(await closePaperTradeAtMarket(req.params.id, req.body.status ?? "manual_close"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/charts/:assetType/:symbol/candles", async (req, res, next) => {
  try {
    res.json(await getCandles(req.params.assetType, req.params.symbol, String(req.query.timeframe ?? "")));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/charts/:assetType/:symbol/markers", async (req, res, next) => {
  try {
    res.json(await getChartMarkers(req.params.assetType, req.params.symbol));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/charts/:assetType/:symbol/position-lines", async (req, res, next) => {
  try {
    res.json(await getPositionLines(req.params.assetType, req.params.symbol));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/news/latest", async (req, res, next) => {
  try {
    res.json(await collectLatestNews({ market: req.query.market, limit: Number(req.query.limit ?? 50) }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/news/status", async (_req, res, next) => {
  try {
    res.json(await getNewsStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/news/scan", async (req, res, next) => {
  try {
    res.json(await collectLatestNews({ market: req.body?.market ?? req.query.market, symbol: req.body?.symbol, limit: Number(req.body?.limit ?? 50) }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/news/crypto/:symbol", async (req, res, next) => {
  try {
    res.json(await collectLatestNews({ market: "crypto", symbol: req.params.symbol, limit: 20 }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/news/:ticker", async (req, res, next) => {
  try {
    res.json(await collectLatestNews({ market: req.query.market ?? "stocks", symbol: req.params.ticker, limit: 20 }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/assets/:assetType/:symbol/logo", async (req, res, next) => {
  try {
    res.json(await getAssetLogo(req.params.assetType, req.params.symbol));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/assets/:assetType/:symbol/profile", async (req, res, next) => {
  try {
    res.json(await getAssetProfile(req.params.assetType, req.params.symbol));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/activity-feed", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.paperTradeEvent.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take: 80 }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/settings", async (_req, res, next) => {
  try {
    res.json(await getOrCreateUserSettings());
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/settings", async (req, res, next) => {
  try {
    const user = await getOrCreateUserSettings();
    const numberOrCurrent = (value: unknown, current: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : current;
    };
    const data = {
      demoCapital: numberOrCurrent(req.body.demoCapital, user.demoCapital),
      riskPerTradePercent: numberOrCurrent(req.body.riskPerTradePercent, user.riskPerTradePercent),
      maxOpenTrades: Math.max(1, Math.floor(numberOrCurrent(req.body.maxOpenTrades, user.maxOpenTrades))),
      maxDailyLossPercent: numberOrCurrent(req.body.maxDailyLossPercent, user.maxDailyLossPercent),
      displayCurrency: String(req.body.displayCurrency ?? user.displayCurrency) === "USD" ? "USD" : user.displayCurrency,
      beginnerMode: req.body.beginnerMode === undefined ? user.beginnerMode : Boolean(req.body.beginnerMode),
      autoPaperTrading: req.body.autoPaperTrading === undefined ? user.autoPaperTrading : Boolean(req.body.autoPaperTrading),
      realTradingEnabled: false
    };

    res.json(await prisma.user.update({ where: { id: user.id }, data }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/scanner/run", async (req, res, next) => {
  try {
    const scan = await runMarketScan({ ...(req.body ?? {}), market: req.body?.market ?? req.query.market });
    res.json({ ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/scanner/latest", async (req, res, next) => {
  try {
    const scan = await getLatestScan(normalizeMarketMode(req.query.market));
    res.json(scan ? { ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) } : null);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/scanner/signals", async (req, res, next) => {
  try {
    const signals = await getSignals(normalizeMarketMode(req.query.market));
    res.json(await enrichSignalsWithAnalyses(signals));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stocks/dashboard", async (_req, res, next) => {
  try {
    res.json(await getAssetDashboard("stocks"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/dashboard", async (_req, res, next) => {
  try {
    res.json(await getAssetDashboard("crypto"));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/stocks/scanner/run", async (req, res, next) => {
  try {
    const scan = await runMarketScan({ ...(req.body ?? {}), market: "stocks" });
    res.json({ ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/crypto/scanner/run", async (req, res, next) => {
  try {
    const scan = await runMarketScan({ ...(req.body ?? {}), market: "crypto" });
    res.json({ ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stocks/scanner/latest", async (_req, res, next) => {
  try {
    const scan = await getLatestScan("stocks");
    res.json(scan ? { ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) } : null);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/scanner/latest", async (_req, res, next) => {
  try {
    const scan = await getLatestScan("crypto");
    res.json(scan ? { ...scan, signals: await enrichSignalsWithAnalyses(scan.signals) } : null);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stocks/signals", async (_req, res, next) => {
  try {
    res.json(await enrichSignalsWithAnalyses(await getSignals("stocks")));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/signals", async (_req, res, next) => {
  try {
    res.json(await enrichSignalsWithAnalyses(await getSignals("crypto")));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/stocks/trade-plans", async (req, res, next) => {
  try {
    const plan = await createTradePlanForAsset(String(req.body.ticker), "stocks");
    if (!plan) return res.status(404).json({ error: "Asset not found" });
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

apiRouter.post("/crypto/trade-plans", async (req, res, next) => {
  try {
    const plan = await createTradePlanForAsset(String(req.body.symbol ?? req.body.ticker), "crypto");
    if (!plan) return res.status(404).json({ error: "Asset not found" });
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

apiRouter.get("/stocks/paper-trades", async (_req, res, next) => {
  try {
    res.json(await listPaperTrades("stock"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/paper-trades", async (_req, res, next) => {
  try {
    res.json(await listPaperTrades("crypto"));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/stocks/paper-trades", async (req, res, next) => {
  try {
    res.json(await approveDemoTrade(String(req.body.tradePlanId)));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/crypto/paper-trades", async (req, res, next) => {
  try {
    res.json(await approveDemoTrade(String(req.body.tradePlanId)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stocks/:ticker", async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const stock = await getAssetDetailPayload(ticker, "stocks");
    return stock ? res.json(stock) : res.status(404).json({ error: "Asset not found" });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/:symbol", async (req, res, next) => {
  try {
    const stock = await getAssetDetailPayload(req.params.symbol.toUpperCase(), "crypto");
    return stock ? res.json(stock) : res.status(404).json({ error: "Asset not found" });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stocks/:ticker/chart", async (req, res, next) => {
  try {
    res.json(await marketDataProvider.getChart(req.params.ticker.toUpperCase(), "stocks"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/crypto/:symbol/chart", async (req, res, next) => {
  try {
    res.json(await marketDataProvider.getChart(req.params.symbol.toUpperCase(), "crypto"));
  } catch (error) {
    next(error);
  }
});

async function createResearchForTicker(ticker: string, market = normalizeMarketMode()) {
  const assetType = assetTypeForMarket(market);
  const stock = await marketDataProvider.getStock(ticker, market);
  if (!stock) throw new Error("Asset not found.");

  const signal = await prisma.marketSignal.findFirst({
    where: { ticker: stock.ticker, assetType },
    orderBy: { createdAt: "desc" }
  });
  const report = await generateResearchReport(stock, signal ?? undefined);

  return prisma.researchReport.create({
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
}

apiRouter.post("/stocks/:ticker/research", async (req, res, next) => {
  try {
    res.json(await createResearchForTicker(req.params.ticker.toUpperCase(), "stocks"));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/crypto/:symbol/research", async (req, res, next) => {
  try {
    res.json(await createResearchForTicker(req.params.symbol.toUpperCase(), "crypto"));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/research/:ticker", async (req, res, next) => {
  try {
    const market = normalizeMarketMode(req.query.market);
    const assetType = assetTypeForMarket(market);
    const report = await prisma.researchReport.findFirst({
      where: { ticker: req.params.ticker.toUpperCase(), assetType },
      orderBy: { createdAt: "desc" }
    });

    if (!report) return res.json(await createResearchForTicker(req.params.ticker.toUpperCase(), market));
    res.json(report);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/research/:ticker/generate", async (req, res, next) => {
  try {
    res.json(await createResearchForTicker(req.params.ticker.toUpperCase(), normalizeMarketMode(req.query.market ?? req.body?.market)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/reports/investment/:ticker", async (req, res, next) => {
  try {
    res.json(await generateDocumentedInvestmentReport(req.params.ticker.toUpperCase(), normalizeMarketMode(req.query.market)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/reports/investment/:ticker/markdown", async (req, res, next) => {
  try {
    const report = await generateDocumentedInvestmentReport(req.params.ticker.toUpperCase(), normalizeMarketMode(req.query.market));
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.ticker}-documented-research.md"`);
    res.send(report.markdown);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/reports/weekly", async (_req, res, next) => {
  try {
    res.json(await generateWeeklyTraderReport());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/timeframes/:ticker", async (req, res, next) => {
  try {
    res.json(await analyzeMultiTimeframe(req.params.ticker.toUpperCase(), normalizeMarketMode(req.query.market)));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/trade-plans", async (req, res, next) => {
  try {
    const plan = await createTradePlanForAsset(String(req.body.ticker), normalizeMarketMode(req.body.market));
    if (!plan) return res.status(404).json({ error: "Asset not found" });
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

apiRouter.get("/trade-plans/:ticker", async (req, res, next) => {
  try {
    const market = req.query.market ? normalizeMarketMode(req.query.market) : null;
    const assetType = market ? assetTypeForMarket(market) : undefined;
    const plans = await prisma.tradePlan.findMany({
      where: { ticker: req.params.ticker.toUpperCase(), ...(assetType ? { assetType } : {}) },
      orderBy: { createdAt: "desc" }
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/trade-plans", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.tradePlan.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/paper-trades", async (req, res, next) => {
  try {
    res.json(await approveDemoTrade(String(req.body.tradePlanId)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/paper-trades", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await listPaperTrades(assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/paper-trades/:id/close", async (req, res, next) => {
  try {
    res.json(await closePaperTradeAtMarket(req.params.id, req.body.status ?? "manual_close"));
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/paper-trades/:id/update-price", async (req, res, next) => {
  try {
    res.json(await refreshPaperTradeFromMarket(req.params.id));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/watchlist", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.watchlistItem.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/watchlist", async (req, res, next) => {
  try {
    const ticker = String(req.body.ticker).toUpperCase();
    const market = normalizeMarketMode(req.body.market);
    const assetType = assetTypeForMarket(market);
    const stock = await marketDataProvider.getStock(ticker, market);
    if (!stock) return res.status(404).json({ error: "Asset not found" });

    const signal = await prisma.marketSignal.findFirst({
      where: { ticker, assetType },
      orderBy: { createdAt: "desc" }
    });

    const item = await prisma.watchlistItem.upsert({
      where: { ticker },
      update: {
        assetType,
        companyName: stock.companyName,
        score: Number(req.body.score ?? signal?.score ?? 50),
        riskLevel: String(req.body.riskLevel ?? signal?.riskLevel ?? "Medium"),
        decision: String(req.body.decision ?? signal?.decision ?? "Research More"),
        notes: req.body.notes
      },
      create: {
        assetType,
        ticker,
        companyName: stock.companyName,
        score: Number(req.body.score ?? signal?.score ?? 50),
        riskLevel: String(req.body.riskLevel ?? signal?.riskLevel ?? "Medium"),
        decision: String(req.body.decision ?? signal?.decision ?? "Research More"),
        notes: req.body.notes
      }
    });

    res.json(item);
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/watchlist/:ticker", async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    if (assetType) {
      await prisma.watchlistItem.deleteMany({ where: { ticker, assetType } });
    } else {
      await prisma.watchlistItem.delete({ where: { ticker } });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/journal", async (_req, res, next) => {
  try {
    res.json(await prisma.journalEntry.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/journal", async (req, res, next) => {
  try {
    const entry = await prisma.journalEntry.create({
      data: {
        ticker: String(req.body.ticker).toUpperCase(),
        decision: String(req.body.decision),
        entryReason: String(req.body.entryReason),
        exitReason: req.body.exitReason,
        emotion: String(req.body.emotion),
        mistake: req.body.mistake,
        lesson: String(req.body.lesson),
        result: String(req.body.result),
        aiReview: generateJournalReview(req.body)
      }
    });
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/journal/:id/ai-review", async (req, res, next) => {
  try {
    const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });

    const aiReview = generateJournalReview(entry);
    res.json(await prisma.journalEntry.update({ where: { id: entry.id }, data: { aiReview } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/alerts", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.alert.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" } }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/alerts", async (req, res, next) => {
  try {
    const alert = await createAlert({
      assetType: assetTypeForMarket(normalizeMarketMode(req.body.market)),
      ticker: String(req.body.ticker ?? "SYSTEM").toUpperCase(),
      alertType: String(req.body.alertType ?? "Price"),
      targetPrice: req.body.targetPrice ? Number(req.body.targetPrice) : undefined,
      message: String(req.body.message ?? "Research reminder"),
      severity: String(req.body.severity ?? "Info")
    });
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/alerts/:id", async (req, res, next) => {
  try {
    await prisma.alert.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/alerts/:id/read", async (req, res, next) => {
  try {
    res.json(await markAlertRead(req.params.id));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/automation/status", async (_req, res, next) => {
  try {
    res.json(await getAutomationStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/ai/status", async (_req, res, next) => {
  try {
    res.json(await getAIStatus());
  } catch (error) {
    next(error);
  }
});



apiRouter.get("/ai/analyses", async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.limit ?? 100), 250);
    res.json(
      await prisma.aIAnalysis.findMany({
        orderBy: { createdAt: "desc" },
        take
      })
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/automation/jobs/:name/run", async (req, res, next) => {
  try {
    const handler = jobHandlers[req.params.name];
    if (!handler) return res.status(404).json({ error: "Automation job not found" });
    const summary = await handler();
    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/automation/auto-paper-trading", async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst();
    const autoPaperTrading = Boolean(req.body.autoPaperTrading);
    const saved = user
      ? await prisma.user.update({ where: { id: user.id }, data: { autoPaperTrading, realTradingEnabled: false } })
      : await prisma.user.create({
          data: {
            name: "Demo User",
            email: "demo@tradepilot.local",
            autoPaperTrading,
            realTradingEnabled: false
          }
        });
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/automation/real-trading-attempt", async (req, res, next) => {
  try {
    res.status(403).json(await blockRealTradingAttempt(req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/agents/runs", async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.limit ?? 100), 250);
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.agentRun.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/learning/summary", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await getLearningSummary(assetType));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/strategy/performance", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    const [performance, events, riskEvents, backtests] = await Promise.all([
      prisma.strategyPerformance.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.paperTradeEvent.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.riskEvent.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.backtestResult.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take: 10 })
    ]);
    const filteredPerformance = assetType
      ? performance.filter((item) => item.scope === "assetType" && item.scopeValue === assetType)
      : performance;
    res.json({ performance: filteredPerformance, events, riskEvents, backtests });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/predictions", async (req, res, next) => {
  try {
    const assetType = req.query.market ? assetTypeFromMarketInput(req.query.market) : undefined;
    res.json(await prisma.aIPrediction.findMany({ where: assetTypeWhere(assetType), orderBy: { createdAt: "desc" }, take: 100 }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/broker/status", async (_req, res, next) => {
  try {
    res.json(await getBrokerStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/broker/sync", async (_req, res, next) => {
  try {
    res.json(await syncBrokerAccount());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/broker/orders", async (_req, res, next) => {
  try {
    res.json(await getBrokerOrders());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/broker/orders/from-trade-plan", async (req, res, next) => {
  try {
    res.json(await submitBrokerOrderFromTradePlan(String(req.body.tradePlanId)));
  } catch (error) {
    next(error);
  }
});


apiRouter.get("/lean/status", async (_req, res, next) => {
  try {
    res.json(await getLeanEngineStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/lean/jobs", async (_req, res, next) => {
  try {
    res.json(await listLeanJobs());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/lean/jobs/:id", async (req, res, next) => {
  try {
    res.json(await getLeanJob(req.params.id));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/lean/backtests", async (req, res, next) => {
  try {
    const startDate = String(req.body.startDate ?? "");
    const endDate = String(req.body.endDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: "startDate and endDate must use YYYY-MM-DD." });
    }
    res.status(202).json(await submitLeanBacktest({
      startDate,
      endDate,
      initialCash: Number(req.body.initialCash ?? 100_000),
      benchmark: String(req.body.benchmark ?? "SPY"),
      symbols: Array.isArray(req.body.symbols) ? req.body.symbols.map(String) : undefined,
      parameters: req.body.parameters && typeof req.body.parameters === "object" ? req.body.parameters : undefined
    }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/lean/paper/start", async (req, res, next) => {
  try {
    res.status(202).json(await startLeanPaperTrading({
      initialCash: Number(req.body.initialCash ?? 100_000),
      symbols: Array.isArray(req.body.symbols) ? req.body.symbols.map(String) : undefined,
      parameters: req.body.parameters && typeof req.body.parameters === "object" ? req.body.parameters : undefined
    }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/lean/jobs/:id/stop", async (req, res, next) => {
  try {
    res.json(await stopLeanJob(req.params.id));
  } catch (error) {
    next(error);
  }
});
