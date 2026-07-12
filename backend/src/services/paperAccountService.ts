import type { PaperTrade, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { marketDataProvider, marketForAssetType, normalizeAssetType, type AssetType } from "./marketDataProvider.js";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export const PAPER_ACCOUNT_USER_ID = "demo@tradepilot.local";
export const PAPER_ACCOUNT_CURRENCY = "EUR";
export const PAPER_STARTING_BALANCE = 500;

function money(value: number) {
  return Number(value.toFixed(2));
}

function pct(value: number) {
  return Number(value.toFixed(2));
}

function isOpen(status: string) {
  return status.toLowerCase() === "open";
}

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfDay();
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function startOfMonth() {
  const date = startOfDay();
  date.setDate(1);
  return date;
}

async function getAssetName(assetType: string, ticker: string) {
  const market = marketForAssetType(normalizeAssetType(assetType));
  const asset = await marketDataProvider.getStock(ticker, market).catch(() => null);
  return asset?.companyName ?? ticker;
}

async function ensurePaperAccount(client: PrismaLike = prisma) {
  return client.paperAccount.upsert({
    where: { userId: PAPER_ACCOUNT_USER_ID },
    update: {},
    create: {
      userId: PAPER_ACCOUNT_USER_ID,
      currency: PAPER_ACCOUNT_CURRENCY,
      startingBalance: PAPER_STARTING_BALANCE,
      cashBalance: PAPER_STARTING_BALANCE,
      availableCash: PAPER_STARTING_BALANCE,
      totalEquity: PAPER_STARTING_BALANCE,
      buyingPowerPaper: PAPER_STARTING_BALANCE
    }
  });
}

async function tradeStrategyName(client: PrismaLike, trade: PaperTrade) {
  if (!trade.tradePlanId) return "Unclassified";
  const plan = await client.tradePlan.findUnique({ where: { id: trade.tradePlanId } }).catch(() => null);
  return plan?.strategyName ?? "Unclassified";
}

async function syncPaperTradeToPosition(client: PrismaLike, trade: PaperTrade, accountId: string) {
  const open = isOpen(trade.status);
  const exitPrice = trade.exitPrice ?? (open ? null : trade.currentPrice);
  const initialPositionValue = money(trade.entryPrice * trade.quantity);
  const positionValue = money((open ? trade.currentPrice : exitPrice ?? trade.currentPrice) * trade.quantity);
  const unrealizedPnL = open ? money((trade.currentPrice - trade.entryPrice) * trade.quantity) : 0;
  const realizedPnL = open ? 0 : money(((exitPrice ?? trade.currentPrice) - trade.entryPrice) * trade.quantity);
  const pnlPercent = pct((((open ? trade.currentPrice : exitPrice ?? trade.currentPrice) - trade.entryPrice) / trade.entryPrice) * 100);
  const [assetName, strategyName] = await Promise.all([
    getAssetName(trade.assetType, trade.ticker),
    tradeStrategyName(client, trade)
  ]);

  return client.paperPosition.upsert({
    where: { sourcePaperTradeId: trade.id },
    update: {
      currentPrice: trade.currentPrice,
      exitPrice,
      quantity: trade.quantity,
      positionValue,
      initialPositionValue,
      unrealizedPnL,
      realizedPnL,
      pnlPercent,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      strategyName,
      exitReason: open ? null : trade.status,
      status: trade.status,
      closedAt: trade.closedAt
    },
    create: {
      accountId,
      sourcePaperTradeId: trade.id,
      assetType: trade.assetType,
      ticker: trade.ticker,
      symbol: trade.ticker,
      assetName,
      entryPrice: trade.entryPrice,
      currentPrice: trade.currentPrice,
      exitPrice,
      quantity: trade.quantity,
      positionValue,
      initialPositionValue,
      unrealizedPnL,
      realizedPnL,
      pnlPercent,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      strategyName,
      entryReason: "Approved paper trade plan",
      exitReason: open ? null : trade.status,
      status: trade.status,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt
    }
  });
}

async function createSnapshot(client: PrismaLike, account: Awaited<ReturnType<typeof ensurePaperAccount>>) {
  return client.equitySnapshot.create({
    data: {
      accountId: account.id,
      totalEquity: account.totalEquity,
      cashBalance: account.cashBalance,
      openPositionsValue: account.openPositionsValue,
      unrealizedPnL: account.unrealizedPnL,
      realizedPnL: account.realizedPnL,
      drawdown: account.maxDrawdown
    }
  });
}

export async function reconcilePaperAccount(client: PrismaLike = prisma, options: { createSnapshot?: boolean } = {}) {
  const account = await ensurePaperAccount(client);
  const trades = await client.paperTrade.findMany({ orderBy: { openedAt: "asc" } });

  for (const trade of trades) {
    await syncPaperTradeToPosition(client, trade, account.id);
  }

  const tradeIds = trades.map((trade) => trade.id);
  if (tradeIds.length) {
    await client.paperPosition.deleteMany({
      where: { accountId: account.id, sourcePaperTradeId: { not: null, notIn: tradeIds } }
    });
  } else {
    await client.paperPosition.deleteMany({ where: { accountId: account.id, sourcePaperTradeId: { not: null } } });
  }

  const positions = await client.paperPosition.findMany({ where: { accountId: account.id } });
  const openPositions = positions.filter((position) => isOpen(position.status));
  const closedPositions = positions.filter((position) => !isOpen(position.status));
  const sinceDay = startOfDay();
  const sinceWeek = startOfWeek();
  const sinceMonth = startOfMonth();

  const openInitialCost = openPositions.reduce((total, position) => total + position.initialPositionValue, 0);
  const openPositionsValue = openPositions.reduce((total, position) => total + position.positionValue, 0);
  const unrealizedPnL = openPositions.reduce((total, position) => total + position.unrealizedPnL, 0);
  const realizedPnL = closedPositions.reduce((total, position) => total + position.realizedPnL, 0);
  const realizedSince = (date: Date) =>
    closedPositions
      .filter((position) => position.closedAt && position.closedAt >= date)
      .reduce((total, position) => total + position.realizedPnL, 0);
  const cashBalance = money(account.startingBalance - openInitialCost + realizedPnL);
  const totalEquity = money(cashBalance + openPositionsValue);
  const totalReturnPercent = pct(((totalEquity - account.startingBalance) / account.startingBalance) * 100);
  const previousPeak = await client.equitySnapshot.aggregate({
    where: { accountId: account.id },
    _max: { totalEquity: true }
  });
  const peak = Math.max(previousPeak._max.totalEquity ?? account.startingBalance, totalEquity, account.startingBalance);
  const currentDrawdown = peak > 0 ? pct(((peak - totalEquity) / peak) * 100) : 0;

  const updated = await client.paperAccount.update({
    where: { id: account.id },
    data: {
      cashBalance,
      availableCash: money(Math.max(0, cashBalance)),
      usedCapital: money(openInitialCost),
      openPositionsValue: money(openPositionsValue),
      unrealizedPnL: money(unrealizedPnL),
      realizedPnL: money(realizedPnL),
      totalEquity,
      totalReturnPercent,
      dailyPnL: money(realizedSince(sinceDay) + unrealizedPnL),
      weeklyPnL: money(realizedSince(sinceWeek) + unrealizedPnL),
      monthlyPnL: money(realizedSince(sinceMonth) + unrealizedPnL),
      maxDrawdown: Math.max(account.maxDrawdown, currentDrawdown),
      buyingPowerPaper: money(Math.max(0, cashBalance)),
      currency: account.currency || PAPER_ACCOUNT_CURRENCY
    }
  });

  if (options.createSnapshot ?? true) {
    await createSnapshot(client, updated);
  }

  return updated;
}

async function findPositionForTrade(client: PrismaLike, tradeId: string) {
  return client.paperPosition.findUnique({ where: { sourcePaperTradeId: tradeId } });
}

export async function registerPaperTradeOpened(client: PrismaLike, trade: PaperTrade) {
  const account = await reconcilePaperAccount(client, { createSnapshot: false });
  const position = await findPositionForTrade(client, trade.id);
  const strategyName = position?.strategyName ?? (await tradeStrategyName(client, trade));
  const label = `BUY @ ${trade.entryPrice.toFixed(2)}`;
  await client.paperTradeEvent.create({
    data: {
      accountId: account.id,
      positionId: position?.id,
      paperTradeId: trade.id,
      assetType: trade.assetType,
      ticker: trade.ticker,
      symbol: trade.ticker,
      eventType: "paper_buy_executed",
      price: trade.entryPrice,
      quantity: trade.quantity,
      positionValue: trade.positionSize,
      pnl: 0,
      pnlPercent: 0,
      profitLoss: 0,
      reason: "risk_engine_approved",
      strategyName,
      candleTime: trade.openedAt,
      message: `${label} - ${strategyName}. Risk capped with stop-loss and take-profit.`
    }
  });
  await client.tradeChartMarker.create({
    data: {
      positionId: position?.id,
      assetType: trade.assetType,
      ticker: trade.ticker,
      symbol: trade.ticker,
      markerType: "BUY",
      price: trade.entryPrice,
      time: trade.openedAt,
      label: `${label}\nStrategy: ${strategyName}\nRisk: ${PAPER_ACCOUNT_CURRENCY} ${Math.max(0, (trade.entryPrice - trade.stopLoss) * trade.quantity).toFixed(2)}`,
      colorType: "green",
      reason: "risk_engine_approved"
    }
  });

  return reconcilePaperAccount(client);
}

export async function registerPaperTradePriceUpdate(client: PrismaLike, trade: PaperTrade) {
  await reconcilePaperAccount(client, { createSnapshot: false });
  return findPositionForTrade(client, trade.id);
}

export async function registerPaperTradeClosed(client: PrismaLike, trade: PaperTrade, reason = "manual_close") {
  const account = await reconcilePaperAccount(client, { createSnapshot: false });
  const position = await findPositionForTrade(client, trade.id);
  const exitPrice = trade.exitPrice ?? trade.currentPrice;
  const strategyName = position?.strategyName ?? (await tradeStrategyName(client, trade));
  const pnl = money((exitPrice - trade.entryPrice) * trade.quantity);
  const pnlPercent = pct(((exitPrice - trade.entryPrice) / trade.entryPrice) * 100);
  const closedAt = trade.closedAt ?? new Date();

  await client.paperTradeEvent.create({
    data: {
      accountId: account.id,
      positionId: position?.id,
      paperTradeId: trade.id,
      assetType: trade.assetType,
      ticker: trade.ticker,
      symbol: trade.ticker,
      eventType: "paper_sell_executed",
      price: exitPrice,
      quantity: trade.quantity,
      positionValue: money(exitPrice * trade.quantity),
      pnl,
      pnlPercent,
      profitLoss: pnl,
      reason,
      strategyName,
      candleTime: closedAt,
      message: `SELL @ ${exitPrice.toFixed(2)} - P/L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}. Reason: ${reason}.`
    }
  });

  await client.tradeChartMarker.create({
    data: {
      positionId: position?.id,
      assetType: trade.assetType,
      ticker: trade.ticker,
      symbol: trade.ticker,
      markerType: "SELL",
      price: exitPrice,
      time: closedAt,
      label: `SELL @ ${exitPrice.toFixed(2)}\nP/L: ${pnl >= 0 ? "+" : ""}${PAPER_ACCOUNT_CURRENCY} ${pnl.toFixed(2)}\nReason: ${reason}`,
      colorType: pnl >= 0 ? "green" : "red",
      reason
    }
  });

  return reconcilePaperAccount(client);
}

export async function getPaperAccountSummary(assetType?: AssetType) {
  const account = await reconcilePaperAccount();
  const where = assetType ? { accountId: account.id, assetType } : { accountId: account.id };
  const eventWhere = assetType
    ? { assetType, OR: [{ accountId: account.id }, { accountId: null }] }
    : { OR: [{ accountId: account.id }, { accountId: null }] };
  const [openPositions, closedPositions, snapshots, events] = await Promise.all([
    prisma.paperPosition.findMany({ where: { ...where, status: "Open" }, orderBy: { openedAt: "desc" } }),
    prisma.paperPosition.findMany({ where: { ...where, status: { not: "Open" } }, orderBy: { closedAt: "desc" }, take: 100 }),
    prisma.equitySnapshot.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "asc" }, take: 240 }),
    prisma.paperTradeEvent.findMany({ where: eventWhere, orderBy: { createdAt: "desc" }, take: 60 })
  ]);

  return {
    account,
    openPositions,
    closedPositions,
    snapshots,
    activityFeed: events,
    paperOnly: true,
    realTradingEnabled: false,
    noLeverage: true,
    noMargin: true,
    noFutures: true
  };
}

export async function getPaperAccountEquity() {
  const account = await reconcilePaperAccount();
  const snapshots = await prisma.equitySnapshot.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "asc" }, take: 240 });
  return { account, snapshots };
}

export async function resetPaperAccount() {
  return prisma.$transaction(async (tx) => {
    const account = await ensurePaperAccount(tx);
    await tx.tradeChartMarker.deleteMany({});
    await tx.paperTradeEvent.deleteMany({ where: { accountId: account.id } });
    await tx.paperPosition.deleteMany({ where: { accountId: account.id } });
    await tx.equitySnapshot.deleteMany({ where: { accountId: account.id } });
    await tx.paperTrade.deleteMany({});
    const reset = await tx.paperAccount.update({
      where: { id: account.id },
      data: {
        currency: PAPER_ACCOUNT_CURRENCY,
        startingBalance: PAPER_STARTING_BALANCE,
        cashBalance: PAPER_STARTING_BALANCE,
        availableCash: PAPER_STARTING_BALANCE,
        usedCapital: 0,
        openPositionsValue: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
        totalEquity: PAPER_STARTING_BALANCE,
        totalReturnPercent: 0,
        dailyPnL: 0,
        weeklyPnL: 0,
        monthlyPnL: 0,
        maxDrawdown: 0,
        buyingPowerPaper: PAPER_STARTING_BALANCE,
        totalFeesSimulated: 0,
        totalSlippageSimulated: 0
      }
    });
    await createSnapshot(tx, reset);
    return reset;
  });
}
