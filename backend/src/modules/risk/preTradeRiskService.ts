import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";

const D = Prisma.Decimal;

export type PreTradeRiskInput = {
  userId: string;
  portfolioId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity?: string;
  notional?: string;
  estimatedPrice?: string;
};

export async function evaluatePreTradeRisk(input: PreTradeRiskInput) {
  const [user, portfolio, positions, openOrders, latestRisk] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.portfolio.findFirst({ where: { id: input.portfolioId, userId: input.userId, status: "ACTIVE" }, include: { cashBalances: true } }),
    prisma.position.findMany({ where: { portfolioId: input.portfolioId } }),
    prisma.order.count({ where: { portfolioId: input.portfolioId, status: { in: ["CREATED", "VALIDATING", "RISK_APPROVED", "SUBMITTED", "BROKER_ACCEPTED", "PARTIALLY_FILLED"] } } }),
    prisma.riskSnapshot.findFirst({ where: { portfolioId: input.portfolioId }, orderBy: { capturedAt: "desc" } })
  ]);

  if (!user || !portfolio) return { approved: false, reasons: ["ACCOUNT_OR_PORTFOLIO_NOT_FOUND"], metrics: {} };
  if (user.disabledAt) return { approved: false, reasons: ["ACCOUNT_DISABLED"], metrics: {} };

  const reasons: string[] = [];
  const maxOpen = Math.max(1, user.maxOpenTrades);
  if (openOrders + positions.length >= maxOpen && input.side === "BUY") reasons.push("MAX_OPEN_POSITIONS_REACHED");

  if (latestRisk && Number(latestRisk.dailyLossPct) >= user.maxDailyLossPercent) reasons.push("MAX_DAILY_LOSS_REACHED");

  const baseCash = portfolio.cashBalances.find((item) => item.currency === portfolio.baseCurrency)?.available ?? new D(0);
  const requestedNotional = input.notional
    ? new D(input.notional)
    : input.quantity && input.estimatedPrice
      ? new D(input.quantity).mul(new D(input.estimatedPrice))
      : new D(0);

  if (input.side === "BUY" && !input.notional && input.quantity && !input.estimatedPrice) reasons.push("MISSING_MARKET_PRICE_FOR_RISK_CHECK");
  if (input.side === "BUY" && requestedNotional.gt(0) && requestedNotional.gt(baseCash)) reasons.push("INSUFFICIENT_AVAILABLE_CASH");

  const existingPosition = positions.find((position) => position.symbol === input.symbol);
  if (input.side === "SELL" && input.quantity) {
    const ownedQuantity = existingPosition?.quantity ?? new D(0);
    if (new D(input.quantity).gt(ownedQuantity)) reasons.push("SELL_QUANTITY_EXCEEDS_POSITION");
  }

  const equity = positions.reduce((sum, position) => sum.plus(position.marketValue), new D(baseCash));
  const maxPositionPct = Math.min(25, Math.max(1, user.riskPerTradePercent * 10));
  const currentSymbolValue = existingPosition?.marketValue ?? new D(0);
  let postTradeSymbolValue = input.side === "BUY" ? currentSymbolValue.plus(requestedNotional) : currentSymbolValue.minus(requestedNotional);
  if (postTradeSymbolValue.lt(0)) postTradeSymbolValue = new D(0);
  const postTradePct = equity.gt(0) ? postTradeSymbolValue.div(equity).mul(100) : new D(0);
  if (input.side === "BUY" && postTradePct.gt(maxPositionPct)) reasons.push("POSITION_CONCENTRATION_LIMIT");

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      openOrders,
      openPositions: positions.length,
      maxOpenPositions: maxOpen,
      availableCash: baseCash.toString(),
      requestedNotional: requestedNotional.toString(),
      estimatedPositionPercent: postTradePct.toFixed(4),
      maxPositionPercent: maxPositionPct,
      latestDailyLossPercent: latestRisk?.dailyLossPct.toString() ?? "0"
    }
  };
}
