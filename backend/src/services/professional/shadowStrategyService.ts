import type { MockStock } from "../../data/mockStocks.js";
import { prisma } from "../../utils/prisma.js";
import { marketDataProvider, marketForAssetType, type AssetType } from "../marketDataProvider.js";
import { checkQuoteForExecution } from "../marketSafetyService.js";
import { professionalExecutionConfigFromEnv, simulateProfessionalFill } from "./executionSimulator.js";
import { getCurrentProfessionalMarketRegime } from "./marketRegimeService.js";

export async function openShadowTrade(input: {
  assetType: AssetType;
  stock: MockStock;
  strategyName: string;
  strategyVersion?: string;
  stopLoss: number;
  takeProfit: number;
  committeeScore: number;
  reason: string;
  sourceDecisionId?: string;
  context?: Record<string, unknown>;
}) {
  const existing = await prisma.shadowTrade.findFirst({
    where: { assetType: input.assetType, ticker: input.stock.ticker, strategyName: input.strategyName, status: "Open" },
    orderBy: { openedAt: "desc" }
  });
  if (existing) return existing;

  const quoteCheck = checkQuoteForExecution(input.stock, input.assetType, { requireOpenMarket: false });
  if (!quoteCheck.executable) return null;
  const regime = await getCurrentProfessionalMarketRegime(input.assetType);
  const fill = simulateProfessionalFill({
    side: "BUY",
    referencePrice: input.stock.price,
    quantity: 1,
    asset: input.stock,
    ...professionalExecutionConfigFromEnv(),
    seed: `shadow:${input.stock.ticker}:${Date.now()}`
  });

  return prisma.shadowTrade.create({
    data: {
      assetType: input.assetType,
      ticker: input.stock.ticker,
      strategyName: input.strategyName,
      strategyVersion: input.strategyVersion ?? "trend-breakout-v2",
      entryPrice: fill.fillPrice,
      currentPrice: fill.fillPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      quantity: fill.filledQuantity,
      committeeScore: input.committeeScore,
      marketRegime: regime.regime,
      sourceDecisionId: input.sourceDecisionId,
      reason: input.reason,
      contextJson: JSON.stringify({
        ...input.context,
        quoteCheck,
        regime,
        simulatedEntry: fill
      })
    }
  });
}

export async function refreshShadowTrades() {
  const openTrades = await prisma.shadowTrade.findMany({ where: { status: "Open" }, orderBy: { openedAt: "asc" } });
  let updated = 0;
  let closed = 0;

  for (const trade of openTrades) {
    const assetType = trade.assetType === "crypto" ? "crypto" : "stock";
    const market = marketForAssetType(assetType);
    const stock = await marketDataProvider.getStock(trade.ticker, market).catch(() => null);
    const quoteCheck = checkQuoteForExecution(stock, assetType, { requireOpenMarket: false });
    if (!stock || !quoteCheck.executable) continue;

    const currentPrice = stock.price;
    const gross = (currentPrice - trade.entryPrice) * trade.quantity;
    const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const ageDays = (Date.now() - trade.openedAt.getTime()) / 86_400_000;
    let status = "Open";
    if (currentPrice <= trade.stopLoss) status = "Stopped";
    else if (currentPrice >= trade.takeProfit) status = "Target Hit";
    else if (ageDays >= 15) status = "Time Exit";

    await prisma.shadowTrade.update({
      where: { id: trade.id },
      data: {
        currentPrice,
        exitPrice: status === "Open" ? null : currentPrice,
        profitLoss: Number(gross.toFixed(2)),
        profitLossPercent: Number(pnlPercent.toFixed(2)),
        status,
        closedAt: status === "Open" ? null : new Date()
      }
    });
    updated += 1;
    if (status !== "Open") closed += 1;
  }

  return { checked: openTrades.length, updated, closed };
}

export async function getShadowStrategySummary(take = 100, assetType?: AssetType) {
  const trades = await prisma.shadowTrade.findMany({
    where: assetType ? { assetType } : undefined,
    orderBy: { openedAt: "desc" },
    take: Math.max(1, Math.min(500, take))
  });
  const closed = trades.filter((trade) => trade.status !== "Open");
  const winners = closed.filter((trade) => trade.profitLoss > 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.profitLoss, 0);
  const grossLoss = Math.abs(closed.filter((trade) => trade.profitLoss < 0).reduce((sum, trade) => sum + trade.profitLoss, 0));
  return {
    open: trades.filter((trade) => trade.status === "Open").length,
    closed: closed.length,
    winRate: closed.length ? Number(((winners.length / closed.length) * 100).toFixed(2)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99 : 0,
    totalProfitLoss: Number(closed.reduce((sum, trade) => sum + trade.profitLoss, 0).toFixed(2)),
    trades
  };
}
