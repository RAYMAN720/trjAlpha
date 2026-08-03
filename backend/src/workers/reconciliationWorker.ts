import "dotenv/config";
import { prisma } from "../utils/prisma.js";
import { reconcileBrokerAccount } from "../modules/reconciliation/reconciliationService.js";
import { syncOrderFromBroker } from "../modules/trading/orderService.js";
import { log } from "../infrastructure/logger.js";
import { registerDomainEventHandlers } from "../infrastructure/domainEventHandlers.js";

registerDomainEventHandlers();

const workerId = process.env.WORKER_ID ?? `reconciliation-worker-${process.pid}`;
const intervalMs = Math.max(15_000, Number(process.env.RECONCILIATION_INTERVAL_MS ?? 60_000));
let stopping = false;

async function reconcileAll() {
  const accounts = await prisma.brokerAccount.findMany({
    where: { status: { notIn: ["ERROR", "DISCONNECTED", "CONNECTING"] }, portfolioId: { not: null } },
    select: { id: true, userId: true }
  });
  for (const account of accounts) {
    if (stopping) return;
    try {
      await reconcileBrokerAccount(account.userId, account.id);
      const activeOrders = await prisma.order.findMany({
        where: {
          userId: account.userId,
          brokerAccountId: account.id,
          brokerOrderId: { not: null },
          status: { in: ["CREATED", "VALIDATING", "RISK_APPROVED", "SUBMITTED", "BROKER_ACCEPTED", "PARTIALLY_FILLED"] }
        },
        select: { id: true }
      });
      for (const order of activeOrders) {
        await syncOrderFromBroker(account.userId, order.id).catch((error) => {
          log("warn", "order_reconciliation_failed", { workerId, accountId: account.id, orderId: order.id, error: error instanceof Error ? error.message : String(error) });
        });
      }
    } catch (error) {
      await prisma.brokerAccount.update({
        where: { id: account.id },
        data: { lastError: error instanceof Error ? error.message : "Reconciliation failed" }
      }).catch(() => undefined);
      log("warn", "broker_reconciliation_failed", { workerId, accountId: account.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function cleanExpiredSecurityState() {
  const now = new Date();
  await Promise.all([
    prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] } }),
    prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
}

async function loop() {
  while (!stopping) {
    await reconcileAll().catch((error) => log("error", "reconciliation_cycle_failed", { workerId, error: error instanceof Error ? error.message : String(error) }));
    await cleanExpiredSecurityState().catch((error) => log("error", "security_cleanup_failed", { workerId, error: error instanceof Error ? error.message : String(error) }));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await prisma.$disconnect();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
void loop();
