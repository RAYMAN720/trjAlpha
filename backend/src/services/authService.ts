import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { runWithRequestContext } from "../utils/requestContext.js";
import { emailDeliveryConfigured, getOwnerEmail, maskEmail, sendAccessCodeEmail } from "./emailService.js";
import { decryptTotpSecret, verifyTotp } from "./security/totpService.js";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: string;
  sid: string;
  iat: number;
  exp: number;
};

const loginCodeTtlMs = 10 * 60 * 1000;
const loginCodeCooldownMs = 45 * 1000;
const maxLoginCodeAttempts = 5;

export class AuthCodeError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getAccessPasscode() {
  return process.env.APP_ACCESS_PASSCODE?.trim();
}

function getAuthSecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim() || getAccessPasscode();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("APP_AUTH_SECRET is required in production.");
  }
  return secret || "tradepilot-local-dev-secret-change-me";
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("base64url");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthCodeError("Enter a valid email address.", 400);
  return email;
}

function hashLoginCode(email: string, code: string) {
  return createHmac("sha256", getAuthSecret()).update(`${email}:${code}`).digest("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function ensureUser(email: string, name?: string) {
  const cleanName = name?.trim() || email.split("@")[0] || "TradePilot User";
  return prisma.user.upsert({
    where: { email },
    update: { emailVerifiedAt: new Date(), lastLoginAt: new Date() },
    create: {
      email,
      name: cleanName.slice(0, 80),
      role: "USER",
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      displayCurrency: "USD",
      realTradingEnabled: false,
      autoPaperTrading: false
    }
  });
}

export function verifyPasscode(passcode: string) {
  if (process.env.APP_ENABLE_PASSCODE_LOGIN !== "true") {
    throw new AuthCodeError("Passcode login is disabled. Request an email access code instead.", 410);
  }
  const expected = getAccessPasscode();
  if (!expected) throw new AuthCodeError("APP_ACCESS_PASSCODE is not configured.", 503);
  return safeEquals(passcode, expected);
}

export async function requestLoginCode(emailInput?: string) {
  const email = normalizeEmail(emailInput?.trim() || getOwnerEmail());
  const now = new Date();
  const recent = await prisma.authChallenge.findFirst({
    where: { email, purpose: "LOGIN", createdAt: { gt: new Date(now.getTime() - loginCodeCooldownMs) } },
    orderBy: { createdAt: "desc" }
  });
  if (recent) throw new AuthCodeError("A login code was sent recently. Wait a few seconds before requesting another.", 429);
  if (!emailDeliveryConfigured() && process.env.NODE_ENV === "production") {
    throw new AuthCodeError("Email login is not configured. Configure RESEND_API_KEY before public deployment.", 503);
  }

  const code = createSixDigitCode();
  const expiresAt = new Date(now.getTime() + loginCodeTtlMs);
  const delivery = await sendAccessCodeEmail({ to: email, code, expiresAt });
  await prisma.authChallenge.create({
    data: { email, purpose: "LOGIN", codeHash: hashLoginCode(email, code), expiresAt }
  });

  return {
    ok: true,
    email: maskEmail(email),
    emailHint: email,
    expiresAt: expiresAt.toISOString(),
    delivery: delivery.sent ? "email" : "development",
    devCode: delivery.sent ? undefined : code
  };
}

type MfaTokenPayload = { sub: string; purpose: "MFA"; exp: number };

function createMfaToken(userId: string) {
  const payload: MfaTokenPayload = { sub: userId, purpose: "MFA", exp: Math.floor(Date.now() / 1000) + 5 * 60 };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

function verifyMfaToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEquals(signature, signPayload(encoded))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as MfaTokenPayload;
    return payload.purpose === "MFA" && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}

export async function verifyLoginCode(emailInput: string | undefined, code: string, name?: string, request?: Request) {
  const email = normalizeEmail(emailInput?.trim() || getOwnerEmail());
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) throw new AuthCodeError("Enter the 6-digit code from your email.", 400);

  const challenge = await prisma.authChallenge.findFirst({
    where: { email, purpose: "LOGIN", consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }
  });
  if (!challenge) throw new AuthCodeError("No active login code. Request a new code first.", 401);
  if (challenge.attempts >= maxLoginCodeAttempts) throw new AuthCodeError("Too many incorrect attempts. Request a new code.", 429);

  await prisma.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
  if (!safeEquals(challenge.codeHash, hashLoginCode(email, cleanCode))) throw new AuthCodeError("Incorrect login code.", 401);
  await prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });

  const user = await ensureUser(email, name);
  if (user.mfaEnabled && user.mfaSecretEncrypted) {
    return { mfaRequired: true, mfaToken: createMfaToken(user.id), displayName: user.name };
  }
  return createAccessToken(user, request);
}

export async function createAccessToken(userOrEmail?: { id: string; email: string; name: string; role: string } | string, request?: Request) {
  const user = typeof userOrEmail === "object"
    ? userOrEmail
    : await ensureUser(normalizeEmail(typeof userOrEmail === "string" ? userOrEmail : getOwnerEmail()));
  if (await prisma.user.findFirst({ where: { id: user.id, disabledAt: { not: null } } })) {
    throw new AuthCodeError("This account is disabled.", 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlHours = Math.max(1, Number(process.env.APP_AUTH_TOKEN_HOURS ?? 12));
  const sessionId = randomUUID();
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sid: sessionId,
    iat: now,
    exp: now + ttlHours * 60 * 60
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const token = `${encodedPayload}.${signPayload(encodedPayload)}`;

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      ipAddress: request?.ip,
      userAgent: request?.get("user-agent") ?? undefined,
      expiresAt: new Date(payload.exp * 1000)
    }
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { token, expiresAt: new Date(payload.exp * 1000).toISOString(), displayName: user.name, userId: user.id, role: user.role };
}

export function verifyAccessToken(token?: string | null) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signPayload(encodedPayload);
  if (!safeEquals(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenPayload;
    if (!payload.sub || !payload.sid || !payload.email || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function revokeAccessToken(token?: string | null) {
  const payload = verifyAccessToken(token);
  if (!payload) return false;
  await prisma.authSession.updateMany({ where: { id: payload.sid, userId: payload.sub }, data: { revokedAt: new Date() } });
  return true;
}

export async function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
    const payload = verifyAccessToken(token);
    if (!payload || !token) return res.status(401).json({ error: "Unauthorized. Sign in to TradePilot." });

    const session = await prisma.authSession.findFirst({
      where: { id: payload.sid, userId: payload.sub, tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true }
    });
    if (!session || session.user.disabledAt) return res.status(401).json({ error: "Session expired or revoked." });
    await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    return runWithRequestContext({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      sessionId: session.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined
    }, () => next());
  } catch (error) {
    return next(error);
  }
}

export async function validateSessionToken(token?: string | null) {
  const payload = verifyAccessToken(token);
  if (!payload || !token) return null;
  const session = await prisma.authSession.findFirst({
    where: { id: payload.sid, userId: payload.sub, tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true }
  });
  if (!session || session.user.disabledAt) return null;
  return { payload, session, user: session.user };
}

export async function verifyMfaLogin(mfaToken: string, code: string, request?: Request) {
  const payload = verifyMfaToken(mfaToken);
  if (!payload) throw new AuthCodeError("MFA challenge expired. Sign in again.", 401);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.mfaEnabled || !user.mfaSecretEncrypted) throw new AuthCodeError("MFA is not configured for this account.", 400);
  const secret = decryptTotpSecret(user.mfaSecretEncrypted);
  if (!verifyTotp(secret, code)) throw new AuthCodeError("Incorrect authenticator code.", 401);
  return createAccessToken(user, request);
}
