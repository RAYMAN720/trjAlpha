import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { emailDeliveryConfigured, getOwnerEmail, maskEmail, sendAccessCodeEmail } from "./emailService.js";

type AccessTokenPayload = {
  sub: "tradepilot-owner";
  name: "Rayann";
  role: "owner";
  iat: number;
  exp: number;
};

const ownerName = "Rayann";
const loginCodeTtlMs = 10 * 60 * 1000;
const loginCodeCooldownMs = 45 * 1000;
const maxLoginCodeAttempts = 5;

type LoginCodeRecord = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

export class AuthCodeError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

const loginCodes = new Map<string, LoginCodeRecord>();

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
  return process.env.APP_AUTH_SECRET?.trim() || getAccessPasscode() || "tradepilot-local-dev-secret";
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

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, record] of loginCodes.entries()) {
    if (record.expiresAt <= now) loginCodes.delete(email);
  }
}

function createSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashLoginCode(email: string, code: string) {
  return createHmac("sha256", getAuthSecret()).update(`${email}:${code}`).digest("base64url");
}

export function verifyPasscode(passcode: string) {
  if (process.env.APP_ENABLE_PASSCODE_LOGIN !== "true") {
    throw new AuthCodeError("Passcode login is disabled. Request an email access code instead.", 410);
  }

  const expected = getAccessPasscode();
  if (!expected) {
    throw new AuthCodeError("APP_ACCESS_PASSCODE is not configured.", 503);
  }

  return safeEquals(passcode, expected);
}

export async function requestLoginCode() {
  cleanupExpiredCodes();

  const email = getOwnerEmail();
  const existing = loginCodes.get(email);
  const now = Date.now();

  if (existing && now - existing.lastSentAt < loginCodeCooldownMs) {
    throw new AuthCodeError("A login code was sent recently. Wait a few seconds before requesting another.", 429);
  }

  if (!emailDeliveryConfigured() && process.env.NODE_ENV === "production") {
    throw new AuthCodeError("Email login is not configured yet. Add RESEND_API_KEY in Render, then redeploy.", 503);
  }

  const code = createSixDigitCode();
  const expiresAt = new Date(now + loginCodeTtlMs);
  const delivery = await sendAccessCodeEmail({ to: email, code, expiresAt });

  loginCodes.set(email, {
    codeHash: hashLoginCode(email, code),
    expiresAt: expiresAt.getTime(),
    attempts: 0,
    lastSentAt: now
  });

  return {
    ok: true,
    email: maskEmail(email),
    expiresAt: expiresAt.toISOString(),
    delivery: delivery.sent ? "email" : "development",
    devCode: delivery.sent ? undefined : code
  };
}

export function verifyLoginCode(code: string) {
  cleanupExpiredCodes();

  const email = getOwnerEmail();
  const cleanCode = code.trim();
  const record = loginCodes.get(email);

  if (!record) {
    throw new AuthCodeError("No active login code. Request a new code first.", 401);
  }

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new AuthCodeError("Enter the 6-digit code from your email.", 400);
  }

  if (record.expiresAt <= Date.now()) {
    loginCodes.delete(email);
    throw new AuthCodeError("That login code expired. Request a new code.", 401);
  }

  if (record.attempts >= maxLoginCodeAttempts) {
    loginCodes.delete(email);
    throw new AuthCodeError("Too many incorrect attempts. Request a new code.", 429);
  }

  record.attempts += 1;
  const expectedHash = hashLoginCode(email, cleanCode);

  if (!safeEquals(record.codeHash, expectedHash)) {
    throw new AuthCodeError("Incorrect login code.", 401);
  }

  loginCodes.delete(email);
  return createAccessToken();
}

export function createAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const ttlHours = Number(process.env.APP_AUTH_TOKEN_HOURS ?? 12);
  const payload: AccessTokenPayload = {
    sub: "tradepilot-owner",
    name: ownerName,
    role: "owner",
    iat: now,
    exp: now + Math.max(1, ttlHours) * 60 * 60
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    displayName: ownerName
  };
}

export function verifyAccessToken(token?: string | null) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEquals(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenPayload;
    if (payload.sub !== "tradepilot-owner" || payload.role !== "owner") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Unauthorized. Enter a TradePilot email access code." });
  }

  return next();
}
