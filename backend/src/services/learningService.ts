import { prisma } from "../utils/prisma.js";
import { createAlert } from "./alertService.js";
import { learningAgent } from "./agentService.js";
import { marketDataProvider, marketForAssetType, type AssetType, type MarketChartPoint } from "./marketDataProvider.js";

type GroupStats = { key: string; count: number; wins: number; gain: number; loss: number };

function updateGroup(groups: Map<string, GroupStats>, key: string, value: number) {
  const current = groups.get(key) ?? { key, count: 0, wins: 0, gain: 0, loss: 0 };
  current.count += 1;
  if (value > 0) {
    current.wins += 1;
    current.gain += value;
  } else if (value < 0) {
    current.loss += Math.abs(value);
  }
  groups.set(key, current);
}

function scoreGroup(group?: GroupStats) {
  if (!group || group.count === 0) return 0;
  return group.gain - group.loss + group.wins / group.count;
}

function bestAndWorst(groups: Map<string, GroupStats>) {
  const sorted = [...groups.values()].sort((left, right) => scoreGroup(right) - scoreGroup(left));
  return { best: sorted[0]?.key, worst: sorted.at(-1)?.key };
}

function returnAtHorizon(chart: MarketChartPoint[], createdAt: Date, horizonDays: number, entryPrice: number, now: Date) {
  const target = new Date(createdAt.getTime() + horizonDays * 24 * 60 * 60_000);
  if (now < target || entryPrice <= 0) return null;
  const point = chart.find((item) => new Date(item.date).getTime() >= target.getTime());
  if (!point) return null;
  return Number((((point.close - entryPrice) / entryPrice) * 100).toFixed(2));
}

export async function updatePredictionOutcomes(assetType?: AssetType) {
  const pending = await prisma.aIPrediction.findMany({
    where: {
      outcomeStatus: { not: "Complete" },
      ...(assetType ? { assetType } : {})
    },
    take: 100,
    orderBy: { createdAt: "asc" }
  });
  const now = new Date();

  for (const prediction of pending) {
    const normalizedAssetType = prediction.assetType === "crypto" ? "crypto" : "stock";
    const chart = await marketDataProvider.getChart(prediction.ticker, marketForAssetType(normalizedAssetType), "daily");
    if (!chart.length) continue;

    const oneDayReturn = prediction.oneDayReturn ?? returnAtHorizon(chart, prediction.createdAt, 1, prediction.entryPrice, now);
    const sevenDayReturn = prediction.sevenDayReturn ?? returnAtHorizon(chart, prediction.createdAt, 7, prediction.entryPrice, now);
    const thirtyDayReturn = prediction.thirtyDayReturn ?? returnAtHorizon(chart, prediction.createdAt, 30, prediction.entryPrice, now);
    const outcomeStatus = thirtyDayReturn !== null
      ? "Complete"
      : sevenDayReturn !== null
        ? "7D Checked"
        : oneDayReturn !== null
          ? "1D Checked"
          : "Pending";

    if (oneDayReturn === prediction.oneDayReturn && sevenDayReturn === prediction.sevenDayReturn && thirtyDayReturn === prediction.thirtyDayReturn) continue;
    await prisma.aIPrediction.update({
      where: { id: prediction.id },
      data: { oneDayReturn, sevenDayReturn, thirtyDayReturn, checkedAt: now, outcomeStatus }
    });
  }
}

export async function calculateStrategyPerformance(jobName = "dailyReviewJob", assetType?: AssetType) {
  await updatePredictionOutcomes(assetType);
  const performanceScope = assetType ? "assetType" : "global";
  const performanceScopeValue = assetType ?? "auto-paper-trading";
  const predictions = await prisma.aIPrediction.findMany({
    where: { oneDayReturn: { not: null }, ...(assetType ? { assetType } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  const trades = await prisma.paperTrade.findMany({
    where: { status: { not: "Open" }, ...(assetType ? { assetType } : {}) },
    orderBy: { closedAt: "asc" }
  });
  const wins = trades.filter((trade) => trade.profitLoss > 0);
  const losses = trades.filter((trade) => trade.profitLoss < 0);
  const totalGain = wins.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalLoss = Math.abs(losses.reduce((total, trade) => total + trade.profitLoss, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.profitLoss;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }

  const bySignal = new Map<string, GroupStats>();
  const bySector = new Map<string, GroupStats>();
  for (const prediction of predictions) {
    const result = prediction.sevenDayReturn ?? prediction.oneDayReturn;
    if (result === null) continue;
    updateGroup(bySignal, prediction.signalType, result);
    updateGroup(bySector, prediction.sector, result);
  }
  const signal = bestAndWorst(bySignal);
  const sector = bestAndWorst(bySector);
  const tradeCount = trades.length;
  const winRate = tradeCount ? (wins.length / tradeCount) * 100 : 0;
  const averageGain = wins.length ? totalGain / wins.length : 0;
  const averageLoss = losses.length ? totalLoss / losses.length : 0;
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? totalGain : 0;

  const performance = await prisma.strategyPerformance.upsert({
    where: { scope_scopeValue: { scope: performanceScope, scopeValue: performanceScopeValue } },
    update: {
      tradeCount, winRate, averageGain, averageLoss, profitFactor,
      maxDrawdown: Math.abs(maxDrawdown),
      bestSignalType: signal.best,
      worstSignalType: signal.worst,
      bestSector: sector.best,
      worstSector: sector.worst
    },
    create: {
      scope: performanceScope,
      scopeValue: performanceScopeValue,
      tradeCount, winRate, averageGain, averageLoss, profitFactor,
      maxDrawdown: Math.abs(maxDrawdown),
      bestSignalType: signal.best,
      worstSignalType: signal.worst,
      bestSector: sector.best,
      worstSector: sector.worst
    }
  });

  const insightText = signal.best && signal.worst
    ? `Verified market outcomes currently perform better on ${signal.best.toLowerCase()} than ${signal.worst.toLowerCase()} setups.`
    : "The app is still collecting enough verified market outcomes to compare signal types.";
  const confidence = predictions.length >= 30 ? 75 : predictions.length >= 10 ? 60 : 35;
  await prisma.learningInsight.create({ data: { assetType: assetType ?? "stock", title: "Latest verified strategy read", insight: insightText, confidence, category: "performance" } });
  await learningAgent({ assetType, insight: insightText, confidence, category: "performance" }, jobName);
  await createAlert({
    assetType: assetType ?? "stock",
    ticker: "SYSTEM",
    alertType: "daily report ready",
    severity: "Info",
    message: `Verified-outcome review ready. Closed-trade win rate: ${winRate.toFixed(1)}%, profit factor: ${profitFactor.toFixed(2)}.`
  });
  return performance;
}

export async function calculateStrategyPerformanceByName(strategyName: string, assetType: AssetType = "stock") {
  const trades = await prisma.paperTrade.findMany({
    where: {
      assetType,
      status: { not: "Open" },
      tradePlan: { strategyName }
    },
    orderBy: { closedAt: "asc" }
  });
  const wins = trades.filter((trade) => trade.profitLoss > 0);
  const losses = trades.filter((trade) => trade.profitLoss < 0);
  const totalGain = wins.reduce((sum, trade) => sum + trade.profitLoss, 0);
  const totalLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.profitLoss, 0));
  let equity = 500;
  let peak = equity;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.profitLoss;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  const tradeCount = trades.length;
  const performance = await prisma.strategyPerformance.upsert({
    where: { scope_scopeValue: { scope: "strategy", scopeValue: strategyName } },
    update: {
      tradeCount,
      winRate: tradeCount ? (wins.length / tradeCount) * 100 : 0,
      averageGain: wins.length ? totalGain / wins.length : 0,
      averageLoss: losses.length ? totalLoss / losses.length : 0,
      profitFactor: totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? totalGain : 0,
      maxDrawdown
    },
    create: {
      scope: "strategy",
      scopeValue: strategyName,
      tradeCount,
      winRate: tradeCount ? (wins.length / tradeCount) * 100 : 0,
      averageGain: wins.length ? totalGain / wins.length : 0,
      averageLoss: losses.length ? totalLoss / losses.length : 0,
      profitFactor: totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? totalGain : 0,
      maxDrawdown
    }
  });
  return performance;
}

export async function getLearningSummary(assetType?: AssetType) {
  const performanceWhere = assetType
    ? { scope: "assetType", scopeValue: assetType }
    : { scope: "global", scopeValue: "auto-paper-trading" };
  const [performance, insights, predictions] = await Promise.all([
    prisma.strategyPerformance.findFirst({ where: performanceWhere, orderBy: { updatedAt: "desc" } }),
    prisma.learningInsight.findMany({ where: assetType ? { assetType } : undefined, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.aIPrediction.findMany({ where: assetType ? { assetType } : undefined, orderBy: { createdAt: "desc" }, take: 100 })
  ]);
  const completed = predictions.filter((prediction) => prediction.oneDayReturn !== null);
  const wins = completed.filter((prediction) => (prediction.oneDayReturn ?? 0) > 0);
  const gains = wins.map((prediction) => prediction.oneDayReturn ?? 0);
  const losses = completed.filter((prediction) => (prediction.oneDayReturn ?? 0) < 0).map((prediction) => Math.abs(prediction.oneDayReturn ?? 0));
  return {
    performance,
    insights,
    predictionCount: predictions.length,
    verifiedPredictionCount: completed.length,
    winRate: completed.length ? (wins.length / completed.length) * 100 : 0,
    averageGain: gains.length ? gains.reduce((total, value) => total + value, 0) / gains.length : 0,
    averageLoss: losses.length ? losses.reduce((total, value) => total + value, 0) / losses.length : 0,
    outcomeSource: "Historical market candles only"
  };
}
