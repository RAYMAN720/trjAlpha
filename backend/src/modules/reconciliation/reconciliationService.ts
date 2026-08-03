import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { writeAuditEvent } from "../../services/auditService.js";
import { brokerAdapterFor, ownedBrokerAccount } from "../brokers/brokerAccountService.js";

const D = Prisma.Decimal;

export async function reconcileBrokerAccount(userId: string, brokerAccountId: string) {
  const account = await ownedBrokerAccount(userId, brokerAccountId);
  if (!account.portfolioId) throw Object.assign(new Error("Broker account is not linked to a portfolio."), { status: 409 });
  const portfolioId = account.portfolioId;
  const adapter = await brokerAdapterFor(userId, brokerAccountId);
  const [brokerSnapshot, brokerPositions, brokerOpenOrders, localPositions, localCash, localActiveOrders] = await Promise.all([
    adapter.getAccount(),
    adapter.getPositions(),
    adapter.listOrders("open"),
    prisma.position.findMany({ where: { portfolioId, brokerAccountId } }),
    prisma.cashBalance.findFirst({ where: { portfolioId, currency: account.currency ?? "USD" } }),
    prisma.order.findMany({
      where: {
        userId, portfolioId, brokerAccountId,
        status: { in: ["CREATED", "VALIDATING", "RISK_APPROVED", "SUBMITTED", "BROKER_ACCEPTED", "PARTIALLY_FILLED"] }
      },
      select: { id: true, clientOrderId: true, brokerOrderId: true, symbol: true, status: true }
    })
  ]);

  const issues: Array<{ type: string; expected: unknown; actual: unknown; severity?: string }> = [];
  const localOrderIds = new Set(localActiveOrders.map((order) => order.brokerOrderId).filter(Boolean));
  const localClientOrderIds = new Set(localActiveOrders.map((order) => order.clientOrderId));
  for (const remoteOrder of brokerOpenOrders) {
    if (localOrderIds.has(remoteOrder.brokerOrderId) || (remoteOrder.clientOrderId && localClientOrderIds.has(remoteOrder.clientOrderId))) continue;
    issues.push({
      type: "UNKNOWN_BROKER_ORDER",
      severity: "CRITICAL",
      expected: { managedByTradePilot: true },
      actual: {
        brokerOrderId: remoteOrder.brokerOrderId, clientOrderId: remoteOrder.clientOrderId,
        symbol: remoteOrder.symbol, side: remoteOrder.side, type: remoteOrder.type, status: remoteOrder.status
      }
    });
  }
  const localBySymbol = new Map(localPositions.map((position) => [position.symbol, position]));
  for (const remote of brokerPositions) {
    const local = localBySymbol.get(remote.symbol);
    const remoteQuantity = new D(remote.quantity);
    const localQuantity = local?.quantity ?? new D(0);
    if (!local || !new D(localQuantity).equals(remoteQuantity)) {
      issues.push({ type: "POSITION_MISMATCH", expected: local ? { quantity: local.quantity.toString() } : { quantity: "0" }, actual: remote });
      const quantityDelta = remoteQuantity.minus(localQuantity);
      if (!quantityDelta.equals(0)) {
        await prisma.ledgerEntry.create({
          data: {
            portfolioId, eventType: "POSITION_RECONCILIATION", assetSymbol: remote.symbol, currency: brokerSnapshot.currency,
            cashAmount: new D(0), assetQuantity: quantityDelta, feeAmount: new D(0),
            referenceId: `reconcile:${account.id}:${remote.symbol}:${Date.now()}`,
            metadataJson: JSON.stringify({ brokerAccountId, reason: "broker_position_reconciliation" }), effectiveAt: new Date()
          }
        });
      }
    }
    await prisma.position.upsert({
      where: { portfolioId_brokerAccountId_symbol: { portfolioId, brokerAccountId, symbol: remote.symbol } },
      update: {
        quantity: new D(remote.quantity), averageCost: new D(remote.averageCost), marketPrice: new D(remote.marketPrice),
        marketValue: new D(remote.marketValue), unrealizedPnL: new D(remote.unrealizedPnL)
      },
      create: {
        portfolioId, brokerAccountId, symbol: remote.symbol,
        quantity: new D(remote.quantity), averageCost: new D(remote.averageCost), marketPrice: new D(remote.marketPrice),
        marketValue: new D(remote.marketValue), unrealizedPnL: new D(remote.unrealizedPnL)
      }
    });
    localBySymbol.delete(remote.symbol);
  }

  for (const local of localBySymbol.values()) {
    if (!new D(local.quantity).equals(0)) {
      issues.push({ type: "POSITION_MISSING_AT_BROKER", expected: { symbol: local.symbol, quantity: local.quantity.toString() }, actual: { quantity: "0" } });
      await prisma.ledgerEntry.create({
        data: {
          portfolioId, eventType: "POSITION_RECONCILIATION", assetSymbol: local.symbol, currency: brokerSnapshot.currency,
          cashAmount: new D(0), assetQuantity: new D(local.quantity).neg(), feeAmount: new D(0),
          referenceId: `reconcile:${account.id}:${local.symbol}:${Date.now()}`,
          metadataJson: JSON.stringify({ brokerAccountId, reason: "position_missing_at_broker" }), effectiveAt: new Date()
        }
      });
      await prisma.position.update({
        where: { id: local.id },
        data: { quantity: new D(0), marketValue: new D(0), unrealizedPnL: new D(0) }
      });
    }
  }

  const remoteCash = new D(brokerSnapshot.cash);
  if (localCash && !new D(localCash.available).equals(remoteCash)) {
    issues.push({ type: "CASH_MISMATCH", expected: { available: localCash.available.toString() }, actual: { available: remoteCash.toString() } });
    const cashDelta = remoteCash.minus(localCash.available);
    if (!cashDelta.equals(0)) {
      await prisma.ledgerEntry.create({
        data: {
          portfolioId, eventType: "CASH_RECONCILIATION", currency: brokerSnapshot.currency, cashAmount: cashDelta,
          assetQuantity: new D(0), feeAmount: new D(0), referenceId: `reconcile:${account.id}:cash:${Date.now()}`,
          metadataJson: JSON.stringify({ brokerAccountId, reason: "broker_cash_reconciliation" }), effectiveAt: new Date()
        }
      });
    }
  } else if (!localCash && !remoteCash.equals(0)) {
    await prisma.ledgerEntry.create({
      data: {
        portfolioId, eventType: "OPENING_CASH_BALANCE", currency: brokerSnapshot.currency, cashAmount: remoteCash,
        assetQuantity: new D(0), feeAmount: new D(0), referenceId: `reconcile:${account.id}:opening-cash:${Date.now()}`,
        metadataJson: JSON.stringify({ brokerAccountId }), effectiveAt: new Date()
      }
    });
  }

  await prisma.cashBalance.upsert({
    where: { portfolioId_currency: { portfolioId, currency: brokerSnapshot.currency } },
    update: { available: remoteCash, settled: remoteCash },
    create: { portfolioId, currency: brokerSnapshot.currency, available: remoteCash, settled: remoteCash }
  });
  await prisma.brokerAccount.update({
    where: { id: account.id },
    data: { externalAccountId: brokerSnapshot.externalAccountId, status: brokerSnapshot.status, currency: brokerSnapshot.currency, lastSyncAt: new Date(), lastError: null }
  });

  const portfolioValue = new D(brokerSnapshot.portfolioValue || "0");
  const investedValue = brokerPositions.reduce((sum, position) => sum.plus(new D(position.marketValue).abs()), new D(0));
  const grossExposure = portfolioValue.gt(0) ? investedValue.div(portfolioValue).mul(100) : new D(0);
  const largestPosition = brokerPositions.reduce((largest, position) => {
    const value = new D(position.marketValue).abs();
    return value.gt(largest) ? value : largest;
  }, new D(0));
  const largestPositionPct = portfolioValue.gt(0) ? largestPosition.div(portfolioValue).mul(100) : new D(0);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayBaseline = await prisma.performanceSnapshot.findFirst({
    where: { portfolioId, capturedAt: { lt: dayStart } },
    orderBy: { capturedAt: "desc" }
  });
  const dailyPnL = dayBaseline ? portfolioValue.minus(dayBaseline.equity) : new D(0);
  const dailyLossPct = dayBaseline && dayBaseline.equity.gt(0) && dailyPnL.lt(0) ? dailyPnL.abs().div(dayBaseline.equity).mul(100) : new D(0);

  await prisma.$transaction([
    prisma.performanceSnapshot.create({
      data: { portfolioId, equity: portfolioValue, cash: remoteCash, investedValue, dailyPnL, totalPnL: new D(0) }
    }),
    prisma.riskSnapshot.create({
      data: {
        portfolioId,
        grossExposure,
        netExposure: grossExposure,
        largestPositionPct,
        dailyLossPct,
        drawdownPct: new D(0),
        openPositions: brokerPositions.filter((position) => !new D(position.quantity).equals(0)).length,
        status: issues.length ? "RECONCILIATION_WARNING" : "OK",
        detailsJson: JSON.stringify({ brokerAccountId, issueCount: issues.length })
      }
    })
  ]);

  await prisma.reconciliationIssue.updateMany({
    where: { portfolioId, brokerAccountId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() }
  });
  if (issues.length) {
    await prisma.reconciliationIssue.createMany({
      data: issues.map((issue) => ({
        portfolioId, brokerAccountId: account.id, issueType: issue.type, severity: issue.severity ?? "WARNING",
        expectedJson: JSON.stringify(issue.expected), actualJson: JSON.stringify(issue.actual)
      }))
    });
  }

  await writeAuditEvent({ userId, action: "BROKER_RECONCILED", resource: "BrokerAccount", resourceId: account.id, metadata: { issueCount: issues.length } });
  return { account: brokerSnapshot, positions: brokerPositions, openOrders: brokerOpenOrders, issues };
}
