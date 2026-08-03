import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireRequestContext } from "../utils/requestContext.js";
import { createPortfolio, ensureDefaultPortfolio, getPortfolio, listPortfolios } from "../modules/portfolio/portfolioService.js";
import { connectAlpacaAccount, listBrokerAccounts, setLiveBrokerPermission } from "../modules/brokers/brokerAccountService.js";
import { cancelOrder, createAndSubmitOrder, listOrders, syncOrderFromBroker } from "../modules/trading/orderService.js";
import { reconcileBrokerAccount } from "../modules/reconciliation/reconciliationService.js";
import { createStrategy, createStrategyVersion, listStrategies } from "../modules/strategies/strategyService.js";
import { enqueueLeanJob, listUserLeanJobs } from "../modules/lean/leanQueueService.js";
import { writeAuditEvent } from "../services/auditService.js";
import { createRealtimeTicket } from "../infrastructure/realtimeHub.js";
import { prometheusMetrics } from "../infrastructure/metrics.js";
import { redis } from "../infrastructure/redisClient.js";
import { rateLimit } from "../infrastructure/rateLimit.js";
import { getNormalizedQuote } from "../modules/market-data/normalizedMarketDataService.js";
import { createTotpSecret, encryptTotpSecret, decryptTotpSecret, totpUri, verifyTotp } from "../services/security/totpService.js";

export const professionalApiRouter = Router();

professionalApiRouter.get("/capabilities", (_req, res) => {
  res.json({
    version: "4.0.0",
    architecture: "modular-monolith-plus-workers",
    tenancy: "per-user",
    accounting: "decimal-ledger",
    orderManagement: "idempotent-risk-gated",
    brokerAbstraction: ["alpaca"],
    strategyVersioning: true,
    leanExecution: "database-queued-worker-pool",
    realTime: "ticketed WebSocket event layer",
    liveTradingGuard: process.env.ALLOW_LIVE_BROKER_TRADING === "true" ? "operator-enabled" : "disabled",
    custodyModel: "non-custodial broker-connected"
  });
});

professionalApiRouter.get("/quote/:symbol", async (req, res, next) => {
  try {
    const market = String(req.query.market ?? "stocks") === "crypto" ? "crypto" : "stocks";
    const quote = await getNormalizedQuote(req.params.symbol, market);
    if (!quote) return res.status(404).json({ error: "Quote not found." });
    return res.json(quote);
  } catch (error) { next(error); }
});

professionalApiRouter.get("/ops/health", async (_req, res) => {
  const redisStatus = redis.configured() ? await redis.ping().then(() => "ok").catch(() => "error") : "not-configured";
  res.json({ ok: true, database: "connected-by-request", redis: redisStatus, realtime: "websocket", workerQueue: "postgresql" });
});

professionalApiRouter.get("/ops/metrics", (_req, res) => {
  const { role } = requireRequestContext();
  if (!["ADMIN", "SUPER_ADMIN"].includes(role)) return res.status(403).send("Admin role required.\n");
  res.type("text/plain; version=0.0.4").send(prometheusMetrics());
});

professionalApiRouter.post("/realtime/ticket", (_req, res) => {
  const ticket = createRealtimeTicket(requireRequestContext().userId);
  res.json({ ticket, expiresInSeconds: 60, websocketPath: "/ws" });
});

professionalApiRouter.get("/me", async (_req, res, next) => {
  try {
    const context = requireRequestContext();
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { id: true, name: true, email: true, role: true, emailVerifiedAt: true, mfaEnabled: true, displayCurrency: true, createdAt: true, lastLoginAt: true }
    });
    res.json(user);
  } catch (error) { next(error); }
});

professionalApiRouter.post("/security/mfa/setup", async (_req, res, next) => {
  try {
    const context = requireRequestContext();
    const secret = createTotpSecret();
    await prisma.user.update({ where: { id: context.userId }, data: { mfaSecretEncrypted: encryptTotpSecret(secret), mfaEnabled: false } });
    await writeAuditEvent({ action: "MFA_SETUP_STARTED", resource: "User", resourceId: context.userId });
    res.json({ secret, otpauthUri: totpUri(context.email, secret), note: "Verify one authenticator code before MFA is enabled." });
  } catch (error) { next(error); }
});

professionalApiRouter.post("/security/mfa/enable", async (req, res, next) => {
  try {
    const context = requireRequestContext();
    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user?.mfaSecretEncrypted) return res.status(400).json({ error: "Start MFA setup first." });
    if (!verifyTotp(decryptTotpSecret(user.mfaSecretEncrypted), String(req.body?.code ?? ""))) return res.status(401).json({ error: "Incorrect authenticator code." });
    await prisma.user.update({ where: { id: context.userId }, data: { mfaEnabled: true } });
    await writeAuditEvent({ action: "MFA_ENABLED", resource: "User", resourceId: context.userId });
    return res.json({ ok: true, mfaEnabled: true });
  } catch (error) { next(error); }
});

professionalApiRouter.post("/security/mfa/disable", async (req, res, next) => {
  try {
    const context = requireRequestContext();
    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user?.mfaSecretEncrypted || !verifyTotp(decryptTotpSecret(user.mfaSecretEncrypted), String(req.body?.code ?? ""))) return res.status(401).json({ error: "Authenticator code required." });
    await prisma.user.update({ where: { id: context.userId }, data: { mfaEnabled: false, mfaSecretEncrypted: null } });
    await writeAuditEvent({ action: "MFA_DISABLED", resource: "User", resourceId: context.userId });
    return res.json({ ok: true, mfaEnabled: false });
  } catch (error) { next(error); }
});

professionalApiRouter.get("/security/sessions", async (_req, res, next) => {
  try {
    const context = requireRequestContext();
    const sessions = await prisma.authSession.findMany({
      where: { userId: context.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, lastSeenAt: true, expiresAt: true, createdAt: true },
      orderBy: { lastSeenAt: "desc" }
    });
    return res.json(sessions.map((session) => ({ ...session, current: session.id === context.sessionId })));
  } catch (error) { next(error); }
});

professionalApiRouter.delete("/security/sessions/:id", async (req, res, next) => {
  try {
    const context = requireRequestContext();
    const result = await prisma.authSession.updateMany({
      where: { id: req.params.id, userId: context.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (!result.count) return res.status(404).json({ error: "Active session not found." });
    await writeAuditEvent({ action: "SESSION_REVOKED", resource: "AuthSession", resourceId: req.params.id });
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

professionalApiRouter.post("/security/sessions/revoke-others", async (_req, res, next) => {
  try {
    const context = requireRequestContext();
    const result = await prisma.authSession.updateMany({
      where: { userId: context.userId, id: { not: context.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await writeAuditEvent({ action: "OTHER_SESSIONS_REVOKED", resource: "AuthSession", metadata: { count: result.count } });
    return res.json({ ok: true, revoked: result.count });
  } catch (error) { next(error); }
});

professionalApiRouter.get("/portfolios", async (_req, res, next) => {
  try { res.json(await listPortfolios(requireRequestContext().userId)); } catch (error) { next(error); }
});

professionalApiRouter.post("/portfolios", async (req, res, next) => {
  try {
    const userId = requireRequestContext().userId;
    const portfolio = await createPortfolio(userId, req.body ?? {});
    await writeAuditEvent({ action: "PORTFOLIO_CREATED", resource: "Portfolio", resourceId: portfolio.id });
    res.status(201).json(portfolio);
  } catch (error) { next(error); }
});

professionalApiRouter.get("/portfolios/:id", async (req, res, next) => {
  try { res.json(await getPortfolio(requireRequestContext().userId, req.params.id)); } catch (error) { next(error); }
});

professionalApiRouter.get("/brokers", async (_req, res, next) => {
  try { res.json(await listBrokerAccounts(requireRequestContext().userId)); } catch (error) { next(error); }
});

professionalApiRouter.post("/brokers/alpaca", async (req, res, next) => {
  try {
    const account = await connectAlpacaAccount(requireRequestContext().userId, {
      portfolioId: req.body?.portfolioId,
      environment: req.body?.environment,
      keyId: String(req.body?.keyId ?? ""),
      secretKey: String(req.body?.secretKey ?? ""),
      accountLabel: req.body?.accountLabel
    });
    res.status(201).json(account);
  } catch (error) { next(error); }
});

professionalApiRouter.post("/brokers/:id/reconcile", async (req, res, next) => {
  try { res.json(await reconcileBrokerAccount(requireRequestContext().userId, req.params.id)); } catch (error) { next(error); }
});

professionalApiRouter.post("/brokers/:id/live-permission", async (req, res, next) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    res.json(await setLiveBrokerPermission(requireRequestContext().userId, req.params.id, enabled, String(req.body?.confirmation ?? "")));
  } catch (error) { next(error); }
});

professionalApiRouter.use("/orders", rateLimit({
  windowSeconds: 60,
  max: Number(process.env.ORDER_RATE_LIMIT_PER_MINUTE ?? 120),
  keyPrefix: "orders",
  identity: () => requireRequestContext().userId
}));

professionalApiRouter.get("/orders", async (req, res, next) => {
  try { res.json(await listOrders(requireRequestContext().userId, req.query.portfolioId ? String(req.query.portfolioId) : undefined)); } catch (error) { next(error); }
});

professionalApiRouter.post("/orders", async (req, res, next) => {
  try {
    const result = await createAndSubmitOrder(requireRequestContext().userId, req.body, String(req.get("idempotency-key") ?? ""));
    res.status(Number(result.statusCode ?? (result.order.status === "REJECTED" ? 422 : 201))).json(result);
  } catch (error) { next(error); }
});

professionalApiRouter.post("/orders/:id/sync", async (req, res, next) => {
  try { res.json(await syncOrderFromBroker(requireRequestContext().userId, req.params.id)); } catch (error) { next(error); }
});

professionalApiRouter.post("/orders/:id/cancel", async (req, res, next) => {
  try { res.json(await cancelOrder(requireRequestContext().userId, req.params.id)); } catch (error) { next(error); }
});

professionalApiRouter.get("/ledger", async (req, res, next) => {
  try {
    const userId = requireRequestContext().userId;
    const portfolioId = String(req.query.portfolioId ?? (await ensureDefaultPortfolio(userId)).id);
    const portfolio = await prisma.portfolio.findFirst({ where: { id: portfolioId, userId } });
    if (!portfolio) return res.status(404).json({ error: "Portfolio not found." });
    return res.json(await prisma.ledgerEntry.findMany({ where: { portfolioId }, orderBy: { effectiveAt: "desc" }, take: 500 }));
  } catch (error) { next(error); }
});

professionalApiRouter.get("/strategies", async (_req, res, next) => {
  try { res.json(await listStrategies(requireRequestContext().userId)); } catch (error) { next(error); }
});

professionalApiRouter.post("/strategies", async (req, res, next) => {
  try { res.status(201).json(await createStrategy(requireRequestContext().userId, req.body)); } catch (error) { next(error); }
});

professionalApiRouter.post("/strategies/:id/versions", async (req, res, next) => {
  try { res.status(201).json(await createStrategyVersion(requireRequestContext().userId, req.params.id, req.body)); } catch (error) { next(error); }
});

professionalApiRouter.get("/lean/jobs", async (_req, res, next) => {
  try { res.json(await listUserLeanJobs(requireRequestContext().userId)); } catch (error) { next(error); }
});

professionalApiRouter.post("/lean/jobs", async (req, res, next) => {
  try {
    const mode = String(req.body?.mode ?? "BACKTEST").toUpperCase();
    if (mode !== "BACKTEST" && mode !== "PAPER") return res.status(400).json({ error: "mode must be BACKTEST or PAPER" });
    const job = await enqueueLeanJob(requireRequestContext().userId, {
      mode,
      portfolioId: req.body?.portfolioId,
      strategyVersionId: req.body?.strategyVersionId,
      request: req.body?.request ?? {}
    });
    res.status(202).json(job);
  } catch (error) { next(error); }
});

professionalApiRouter.get("/audit/me", async (_req, res, next) => {
  try {
    const { userId } = requireRequestContext();
    return res.json(await prisma.auditEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 }));
  } catch (error) { next(error); }
});

professionalApiRouter.get("/audit", async (req, res, next) => {
  try {
    const { role } = requireRequestContext();
    if (!["ADMIN", "SUPER_ADMIN"].includes(role)) return res.status(403).json({ error: "Admin role required." });
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    return res.json(await prisma.auditEvent.findMany({ where: userId ? { userId } : undefined, orderBy: { createdAt: "desc" }, take: 1000 }));
  } catch (error) { next(error); }
});

professionalApiRouter.get("/reconciliation/issues", async (req, res, next) => {
  try {
    const { userId } = requireRequestContext();
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    return res.json(await prisma.reconciliationIssue.findMany({
      where: { portfolio: { userId }, ...(status ? { status } : {}) },
      orderBy: { detectedAt: "desc" },
      take: 500
    }));
  } catch (error) { next(error); }
});

professionalApiRouter.get("/notifications", async (_req, res, next) => {
  try { res.json(await prisma.notification.findMany({ where: { userId: requireRequestContext().userId }, orderBy: { createdAt: "desc" }, take: 100 })); } catch (error) { next(error); }
});

professionalApiRouter.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const { userId } = requireRequestContext();
    const result = await prisma.notification.updateMany({ where: { id: req.params.id, userId }, data: { readAt: new Date() } });
    if (!result.count) return res.status(404).json({ error: "Notification not found." });
    return res.json({ ok: true });
  } catch (error) { next(error); }
});

professionalApiRouter.post("/notifications/read-all", async (_req, res, next) => {
  try {
    const { userId } = requireRequestContext();
    const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return res.json({ ok: true, updated: result.count });
  } catch (error) { next(error); }
});
