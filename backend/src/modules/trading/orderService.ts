import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { acquireIdempotency, completeIdempotency } from "../../services/idempotencyService.js";
import { writeAuditEvent } from "../../services/auditService.js";
import { brokerAdapterFor, ownedBrokerAccount } from "../brokers/brokerAccountService.js";
import { evaluatePreTradeRisk } from "../risk/preTradeRiskService.js";
import { publishRealtimeEvent } from "../../infrastructure/realtimeHub.js";
import { emitDomainEvent } from "../../infrastructure/eventBus.js";
import { getNormalizedQuote } from "../market-data/normalizedMarketDataService.js";

const D = Prisma.Decimal;
const activeStatuses = ["CREATED", "VALIDATING", "RISK_APPROVED", "SUBMITTED", "BROKER_ACCEPTED", "PARTIALLY_FILLED"];

export type CreateOrderInput = {
  portfolioId: string;
  brokerAccountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type?: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  timeInForce?: string;
  quantity?: string | number;
  notional?: string | number;
  limitPrice?: string | number;
  stopPrice?: string | number;
  estimatedPrice?: string | number;
  source?: string;
};

function decimal(value: string | number | undefined) {
  return value === undefined ? undefined : new D(String(value));
}

export async function createAndSubmitOrder(userId: string, input: CreateOrderInput, idempotencyKey: string) {
  if (!idempotencyKey?.trim()) throw Object.assign(new Error("Idempotency-Key header is required for order submission."), { status: 400 });
  if (!input || typeof input !== "object") throw Object.assign(new Error("Order body is required."), { status: 400 });
  const symbol = String(input.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) throw Object.assign(new Error("Invalid symbol."), { status: 400 });
  if (!['BUY', 'SELL'].includes(String(input.side).toUpperCase())) throw Object.assign(new Error("side must be BUY or SELL."), { status: 400 });
  input.side = String(input.side).toUpperCase() as "BUY" | "SELL";
  const requestedType = String(input.type ?? "MARKET").toUpperCase();
  if (!['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(requestedType)) throw Object.assign(new Error("Unsupported order type."), { status: 400 });
  input.type = requestedType as CreateOrderInput["type"];
  if (input.quantity === undefined && input.notional === undefined) throw Object.assign(new Error("quantity or notional is required."), { status: 400 });
  for (const [name, value] of [["quantity", input.quantity], ["notional", input.notional], ["limitPrice", input.limitPrice], ["stopPrice", input.stopPrice], ["estimatedPrice", input.estimatedPrice]] as const) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0)) throw Object.assign(new Error(`${name} must be a positive number.`), { status: 400 });
  }
  if ((requestedType === "LIMIT" || requestedType === "STOP_LIMIT") && input.limitPrice === undefined) throw Object.assign(new Error("limitPrice is required for limit orders."), { status: 400 });
  if ((requestedType === "STOP" || requestedType === "STOP_LIMIT") && input.stopPrice === undefined) throw Object.assign(new Error("stopPrice is required for stop orders."), { status: 400 });

  const acquired = await acquireIdempotency({ userId, scope: "ORDER_CREATE", key: idempotencyKey.trim(), request: input });
  if (!acquired.created) {
    if (!acquired.existing.responseJson) throw Object.assign(new Error("An order with this idempotency key is already being processed. Retry with the same key after the current request completes."), { status: 409 });
    const replayed = JSON.parse(acquired.existing.responseJson);
    return { ...replayed, replayed: true, statusCode: acquired.existing.statusCode ?? 200 };
  }

  const [portfolio, brokerAccount] = await Promise.all([
    prisma.portfolio.findFirst({ where: { id: input.portfolioId, userId } }),
    ownedBrokerAccount(userId, input.brokerAccountId)
  ]);
  if (!portfolio) throw Object.assign(new Error("Portfolio not found."), { status: 404 });
  if (brokerAccount.portfolioId && brokerAccount.portfolioId !== portfolio.id) throw Object.assign(new Error("Broker account is not linked to this portfolio."), { status: 403 });
  if (["ERROR", "DISCONNECTED", "CONNECTING"].includes(String(brokerAccount.status).toUpperCase())) throw Object.assign(new Error("Broker account is not ready for order submission."), { status: 409 });
  if (brokerAccount.environment === "live" && (!brokerAccount.liveTradingAllowed || process.env.ALLOW_LIVE_BROKER_TRADING !== "true")) {
    throw Object.assign(new Error("Live trading is disabled by platform guardrails."), { status: 403 });
  }

  let effectiveEstimatedPrice = input.estimatedPrice === undefined ? undefined : String(input.estimatedPrice);
  if (!effectiveEstimatedPrice && input.limitPrice !== undefined) effectiveEstimatedPrice = String(input.limitPrice);
  if (!effectiveEstimatedPrice && input.quantity !== undefined) {
    const quote = await getNormalizedQuote(symbol, "stocks").catch(() => null);
    effectiveEstimatedPrice = quote?.last;
  }

  const risk = await evaluatePreTradeRisk({
    userId,
    portfolioId: portfolio.id,
    symbol,
    side: input.side,
    quantity: input.quantity === undefined ? undefined : String(input.quantity),
    notional: input.notional === undefined ? undefined : String(input.notional),
    estimatedPrice: effectiveEstimatedPrice
  });

  const clientOrderId = `tp-${randomUUID()}`;
  const order = await prisma.order.create({
    data: {
      clientOrderId,
      userId,
      portfolioId: portfolio.id,
      brokerAccountId: brokerAccount.id,
      symbol,
      side: input.side,
      type: input.type ?? "MARKET",
      timeInForce: input.timeInForce?.toUpperCase() ?? "DAY",
      quantity: decimal(input.quantity),
      notional: decimal(input.notional),
      limitPrice: decimal(input.limitPrice),
      stopPrice: decimal(input.stopPrice),
      status: risk.approved ? "RISK_APPROVED" : "REJECTED",
      source: input.source ?? "MANUAL",
      riskDecisionJson: JSON.stringify(risk),
      rejectionReason: risk.approved ? null : risk.reasons.join(",")
    }
  });

  await writeAuditEvent({ action: "ORDER_CREATED", resource: "Order", resourceId: order.id, metadata: { symbol, side: input.side, risk } });
  await emitDomainEvent({ type: "ORDER_CREATED", userId, aggregateId: order.id, payload: { symbol, side: input.side, status: order.status } });
  await publishRealtimeEvent(userId, { type: "ORDER_CREATED", orderId: order.id, symbol, status: order.status });

  if (!risk.approved) {
    const response = { order, risk, statusCode: 422 };
    await completeIdempotency(acquired.existing.id, { resourceId: order.id, response, statusCode: 422 });
    await emitDomainEvent({ type: "ORDER_REJECTED", userId, aggregateId: order.id, payload: { symbol, reasons: risk.reasons } });
    return response;
  }

  try {
    const adapter = await brokerAdapterFor(userId, brokerAccount.id);
    const submitted = await adapter.submitOrder({
      clientOrderId,
      symbol,
      side: input.side.toLowerCase() as "buy" | "sell",
      type: (input.type ?? "MARKET").toLowerCase() as "market" | "limit" | "stop" | "stop_limit",
      timeInForce: input.timeInForce ?? "DAY",
      quantity: input.quantity === undefined ? undefined : String(input.quantity),
      notional: input.notional === undefined ? undefined : String(input.notional),
      limitPrice: input.limitPrice === undefined ? undefined : String(input.limitPrice),
      stopPrice: input.stopPrice === undefined ? undefined : String(input.stopPrice)
    });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        brokerOrderId: submitted.brokerOrderId,
        status: submitted.status === "FILLED" ? "FILLED" : "SUBMITTED",
        submittedAt: submitted.submittedAt ? new Date(submitted.submittedAt) : new Date()
      }
    });
    await writeAuditEvent({ action: "ORDER_SUBMITTED", resource: "Order", resourceId: order.id, metadata: { brokerOrderId: submitted.brokerOrderId } });
    await emitDomainEvent({ type: "ORDER_SUBMITTED", userId, aggregateId: order.id, payload: { symbol, brokerOrderId: submitted.brokerOrderId, status: updated.status } });
    await publishRealtimeEvent(userId, { type: "ORDER_UPDATED", orderId: order.id, symbol, status: updated.status });
    const response = { order: updated, risk, statusCode: 201 };
    await completeIdempotency(acquired.existing.id, { resourceId: order.id, response, statusCode: 201 });
    return response;
  } catch (error) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "ERROR", rejectionReason: error instanceof Error ? error.message : "Broker submission failed." }
    });
    await writeAuditEvent({ action: "ORDER_SUBMISSION_FAILED", resource: "Order", resourceId: order.id, success: false, metadata: { error: updated.rejectionReason } });
    await emitDomainEvent({ type: "ORDER_SUBMISSION_FAILED", userId, aggregateId: order.id, payload: { symbol, error: updated.rejectionReason } });
    const response = { order: updated, risk, error: updated.rejectionReason, statusCode: 502 };
    await completeIdempotency(acquired.existing.id, { resourceId: order.id, response, statusCode: 502 });
    return response;
  }
}

export async function listOrders(userId: string, portfolioId?: string) {
  return prisma.order.findMany({
    where: { userId, ...(portfolioId ? { portfolioId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 250
  });
}

export async function cancelOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw Object.assign(new Error("Order not found."), { status: 404 });
  if (!activeStatuses.includes(order.status)) throw Object.assign(new Error(`Order cannot be cancelled from status ${order.status}.`), { status: 409 });
  if (order.brokerOrderId) {
    const adapter = await brokerAdapterFor(userId, order.brokerAccountId);
    await adapter.cancelOrder(order.brokerOrderId);
  }
  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await writeAuditEvent({ action: "ORDER_CANCELLED", resource: "Order", resourceId: order.id });
  await emitDomainEvent({ type: "ORDER_CANCELLED", userId, aggregateId: order.id, payload: { symbol: order.symbol } });
  await publishRealtimeEvent(userId, { type: "ORDER_UPDATED", orderId: order.id, symbol: order.symbol, status: updated.status });
  return updated;
}

function canonicalBrokerStatus(status: string) {
  const normalized = status.toUpperCase();
  if (["FILLED"].includes(normalized)) return "FILLED";
  if (["PARTIALLY_FILLED"].includes(normalized)) return "PARTIALLY_FILLED";
  if (["CANCELED", "CANCELLED"].includes(normalized)) return "CANCELLED";
  if (["REJECTED"].includes(normalized)) return "REJECTED";
  if (["EXPIRED"].includes(normalized)) return "EXPIRED";
  if (["ACCEPTED", "NEW", "PENDING_NEW", "ACCEPTED_FOR_BIDDING", "HELD"].includes(normalized)) return "BROKER_ACCEPTED";
  return "SUBMITTED";
}

export async function syncOrderFromBroker(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { brokerAccount: true, portfolio: true } });
  if (!order) throw Object.assign(new Error("Order not found."), { status: 404 });
  if (!order.brokerOrderId) return order;
  const adapter = await brokerAdapterFor(userId, order.brokerAccountId);
  const broker = await adapter.getOrder(order.brokerOrderId);
  const raw = broker.raw && typeof broker.raw === "object" ? broker.raw as Record<string, unknown> : {};
  const filledQuantity = new D(String(raw.filled_qty ?? order.filledQuantity));
  const averageFillPrice = raw.filled_avg_price ? new D(String(raw.filled_avg_price)) : order.averageFillPrice;
  const previousFilled = new D(order.filledQuantity);
  const delta = filledQuantity.minus(previousFilled);

  const updated = await prisma.$transaction(async (tx) => {
    if (delta.gt(0) && averageFillPrice) {
      const brokerFillId = `${order.brokerOrderId}:${filledQuantity.toString()}`;
      const existingFill = await tx.orderFill.findFirst({ where: { orderId: order.id, brokerFillId } });
      if (!existingFill) {
        const previousAverage = order.averageFillPrice ?? averageFillPrice;
        const cumulativeValue = filledQuantity.mul(averageFillPrice);
        const previousValue = previousFilled.mul(previousAverage);
        const incrementalPrice = previousFilled.gt(0) ? cumulativeValue.minus(previousValue).div(delta) : averageFillPrice;
        await tx.orderFill.create({
          data: { orderId: order.id, brokerFillId, quantity: delta, price: incrementalPrice, fee: new D(0), executedAt: new Date() }
        });
        const direction = order.side === "BUY" ? new D(1) : new D(-1);
        const cash = delta.mul(incrementalPrice).mul(direction.neg());
        const currency = order.brokerAccount.currency ?? order.portfolio.baseCurrency;
        await tx.ledgerEntry.create({
          data: {
            portfolioId: order.portfolioId, orderId: order.id,
            eventType: order.side === "BUY" ? "BUY" : "SELL", assetSymbol: order.symbol, currency,
            cashAmount: cash, assetQuantity: delta.mul(direction), feeAmount: new D(0),
            referenceId: brokerFillId, metadataJson: JSON.stringify({ brokerOrderId: order.brokerOrderId, fillPrice: incrementalPrice.toString() }), effectiveAt: new Date()
          }
        });

        const existingPosition = await tx.position.findUnique({
          where: { portfolioId_brokerAccountId_symbol: { portfolioId: order.portfolioId, brokerAccountId: order.brokerAccountId, symbol: order.symbol } }
        });
        const existingQty = existingPosition?.quantity ?? new D(0);
        const existingCost = existingPosition?.averageCost ?? new D(0);
        if (order.side === "BUY") {
          const newQty = existingQty.plus(delta);
          const newAverageCost = newQty.gt(0) ? existingQty.mul(existingCost).plus(delta.mul(incrementalPrice)).div(newQty) : new D(0);
          await tx.position.upsert({
            where: { portfolioId_brokerAccountId_symbol: { portfolioId: order.portfolioId, brokerAccountId: order.brokerAccountId, symbol: order.symbol } },
            update: { quantity: newQty, averageCost: newAverageCost, marketPrice: incrementalPrice, marketValue: newQty.mul(incrementalPrice) },
            create: { portfolioId: order.portfolioId, brokerAccountId: order.brokerAccountId, symbol: order.symbol, assetClass: order.assetClass, quantity: newQty, averageCost: newAverageCost, marketPrice: incrementalPrice, marketValue: newQty.mul(incrementalPrice) }
          });
        } else {
          let newQty = existingQty.minus(delta);
          if (newQty.lt(0)) newQty = new D(0);
          const realizedDelta = delta.mul(incrementalPrice.minus(existingCost));
          await tx.position.upsert({
            where: { portfolioId_brokerAccountId_symbol: { portfolioId: order.portfolioId, brokerAccountId: order.brokerAccountId, symbol: order.symbol } },
            update: { quantity: newQty, marketPrice: incrementalPrice, marketValue: newQty.mul(incrementalPrice), realizedPnL: { increment: realizedDelta } },
            create: { portfolioId: order.portfolioId, brokerAccountId: order.brokerAccountId, symbol: order.symbol, assetClass: order.assetClass, quantity: newQty, averageCost: new D(0), marketPrice: incrementalPrice, marketValue: newQty.mul(incrementalPrice), realizedPnL: realizedDelta }
          });
        }

        await tx.cashBalance.upsert({
          where: { portfolioId_currency: { portfolioId: order.portfolioId, currency } },
          update: { available: { increment: cash }, settled: { increment: cash } },
          create: { portfolioId: order.portfolioId, currency, available: cash, settled: cash, reserved: new D(0) }
        });
      }
    }
    return tx.order.update({
      where: { id: order.id },
      data: {
        status: canonicalBrokerStatus(broker.status), filledQuantity,
        averageFillPrice: averageFillPrice ?? undefined,
        filledAt: canonicalBrokerStatus(broker.status) === "FILLED" ? new Date() : order.filledAt
      }
    });
  });
  await writeAuditEvent({ action: "ORDER_RECONCILED", resource: "Order", resourceId: order.id, metadata: { brokerStatus: broker.status, filledQuantity: filledQuantity.toString() } });
  await emitDomainEvent({ type: updated.status === "FILLED" ? "ORDER_FILLED" : "ORDER_UPDATED", userId, aggregateId: order.id, payload: { symbol: order.symbol, status: updated.status, filledQuantity: filledQuantity.toString() } });
  await publishRealtimeEvent(userId, { type: "ORDER_UPDATED", orderId: order.id, symbol: order.symbol, status: updated.status });
  return updated;
}
