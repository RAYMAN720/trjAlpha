import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { encryptCredential } from "../../services/security/credentialVault.js";
import { writeAuditEvent } from "../../services/auditService.js";
import { AlpacaAdapter } from "./alpacaAdapter.js";
import type { BrokerAdapter } from "./brokerAdapter.js";

const D = Prisma.Decimal;

export async function listBrokerAccounts(userId: string) {
  return prisma.brokerAccount.findMany({
    where: { userId },
    select: {
      id: true, portfolioId: true, provider: true, environment: true, externalAccountId: true,
      accountLabel: true, currency: true, status: true, authType: true, isLive: true,
      liveTradingAllowed: true, lastSyncAt: true, lastError: true, createdAt: true, updatedAt: true
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function connectAlpacaAccount(userId: string, input: {
  portfolioId?: string;
  environment?: "paper" | "live";
  keyId: string;
  secretKey: string;
  accountLabel?: string;
}) {
  const environment = input.environment === "live" ? "live" : "paper";
  if (environment === "live" && process.env.ALLOW_LIVE_BROKER_CONNECTIONS !== "true" && process.env.ALLOW_LIVE_BROKER_TRADING !== "true") {
    throw Object.assign(new Error("Live broker account connections are disabled by the platform operator."), { status: 403 });
  }
  const keyId = input.keyId.trim();
  const secretKey = input.secretKey.trim();
  if (keyId.length < 8 || secretKey.length < 16) throw Object.assign(new Error("Broker credentials are incomplete."), { status: 400 });

  const portfolio = input.portfolioId
    ? await prisma.portfolio.findFirst({ where: { id: input.portfolioId, userId } })
    : await prisma.portfolio.findFirst({ where: { userId, isDefault: true } });
  if (!portfolio) throw Object.assign(new Error("Portfolio not found."), { status: 404 });

  const encryptedCredential = encryptCredential({ keyId, secretKey });
  const draft = await prisma.brokerAccount.create({
    data: {
      userId,
      portfolioId: portfolio.id,
      provider: "alpaca",
      environment,
      externalAccountId: `pending:${randomUUID()}`,
      accountLabel: input.accountLabel?.trim() || `Alpaca ${environment}`,
      status: "CONNECTING",
      encryptedCredential,
      credentialKeyVersion: process.env.APP_DATA_ENCRYPTION_KEY_VERSION ?? "v1",
      isLive: environment === "live",
      liveTradingAllowed: false
    }
  });

  try {
    const adapter = new AlpacaAdapter(draft);
    const [snapshot, positions] = await Promise.all([adapter.getAccount(), adapter.getPositions()]);
    const duplicate = snapshot.externalAccountId
      ? await prisma.brokerAccount.findFirst({
          where: { userId, provider: "alpaca", environment, externalAccountId: snapshot.externalAccountId, id: { not: draft.id } }
        })
      : null;

    const account = await prisma.$transaction(async (tx) => {
      const targetId = duplicate?.id ?? draft.id;
      const updated = await tx.brokerAccount.update({
        where: { id: targetId },
        data: {
          portfolioId: portfolio.id,
          encryptedCredential,
          credentialKeyVersion: process.env.APP_DATA_ENCRYPTION_KEY_VERSION ?? "v1",
          accountLabel: input.accountLabel?.trim() || duplicate?.accountLabel || `Alpaca ${environment}`,
          externalAccountId: snapshot.externalAccountId,
          status: snapshot.status,
          currency: snapshot.currency,
          isLive: environment === "live",
          // Linking a live account never grants execution permission by itself.
          liveTradingAllowed: duplicate?.liveTradingAllowed ?? false,
          lastSyncAt: new Date(),
          lastError: null
        }
      });
      if (duplicate) await tx.brokerAccount.delete({ where: { id: draft.id } });

      await tx.cashBalance.upsert({
        where: { portfolioId_currency: { portfolioId: portfolio.id, currency: snapshot.currency } },
        update: { available: new D(snapshot.cash), settled: new D(snapshot.cash) },
        create: { portfolioId: portfolio.id, currency: snapshot.currency, available: new D(snapshot.cash), settled: new D(snapshot.cash) }
      });
      for (const remote of positions) {
        await tx.position.upsert({
          where: { portfolioId_brokerAccountId_symbol: { portfolioId: portfolio.id, brokerAccountId: targetId, symbol: remote.symbol } },
          update: {
            quantity: new D(remote.quantity), averageCost: new D(remote.averageCost), marketPrice: new D(remote.marketPrice),
            marketValue: new D(remote.marketValue), unrealizedPnL: new D(remote.unrealizedPnL)
          },
          create: {
            portfolioId: portfolio.id, brokerAccountId: targetId, symbol: remote.symbol,
            quantity: new D(remote.quantity), averageCost: new D(remote.averageCost), marketPrice: new D(remote.marketPrice),
            marketValue: new D(remote.marketValue), unrealizedPnL: new D(remote.unrealizedPnL)
          }
        });
      }
      return updated;
    });

    await writeAuditEvent({
      action: duplicate ? "BROKER_RECONNECTED" : "BROKER_CONNECTED",
      resource: "BrokerAccount",
      resourceId: account.id,
      metadata: { provider: "alpaca", environment, externalAccountId: account.externalAccountId }
    });
    const { encryptedCredential: _secret, ...safeAccount } = account;
    return safeAccount;
  } catch (error) {
    await prisma.brokerAccount.update({ where: { id: draft.id }, data: { status: "ERROR", lastError: error instanceof Error ? error.message : "Connection failed" } }).catch(() => undefined);
    await writeAuditEvent({ action: "BROKER_CONNECTION_FAILED", resource: "BrokerAccount", resourceId: draft.id, success: false, metadata: { provider: "alpaca", environment } }).catch(() => undefined);
    throw error;
  }
}

export async function ownedBrokerAccount(userId: string, id: string) {
  const account = await prisma.brokerAccount.findFirst({ where: { id, userId } });
  if (!account) throw Object.assign(new Error("Broker account not found."), { status: 404 });
  return account;
}

export async function setLiveBrokerPermission(userId: string, id: string, enabled: boolean, confirmation?: string) {
  const account = await ownedBrokerAccount(userId, id);
  if (account.environment !== "live") throw Object.assign(new Error("Live execution permission only applies to live broker accounts."), { status: 400 });
  if (enabled) {
    if (process.env.ALLOW_LIVE_BROKER_TRADING !== "true") throw Object.assign(new Error("Live trading is disabled by the platform operator."), { status: 403 });
    if (confirmation !== "ENABLE LIVE TRADING") throw Object.assign(new Error("Exact live-trading confirmation text is required."), { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, disabledAt: true } });
    if (!user || user.disabledAt) throw Object.assign(new Error("User account is not eligible for live execution."), { status: 403 });
    if (!user.mfaEnabled) throw Object.assign(new Error("MFA must be enabled before live execution can be activated."), { status: 403 });
  }
  const updated = await prisma.brokerAccount.update({ where: { id: account.id }, data: { liveTradingAllowed: enabled } });
  await writeAuditEvent({ action: enabled ? "LIVE_TRADING_ENABLED" : "LIVE_TRADING_DISABLED", resource: "BrokerAccount", resourceId: account.id, metadata: { environment: account.environment } });
  const { encryptedCredential: _secret, ...safeAccount } = updated;
  return safeAccount;
}

export async function brokerAdapterFor(userId: string, id: string): Promise<BrokerAdapter> {
  const account = await ownedBrokerAccount(userId, id);
  if (account.provider === "alpaca") return new AlpacaAdapter(account);
  throw Object.assign(new Error(`Unsupported broker provider: ${account.provider}`), { status: 400 });
}
