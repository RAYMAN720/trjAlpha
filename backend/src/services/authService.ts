import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { emailDeliveryConfigured, maskEmail, sendAccessCodeEmail } from "./emailService.js";
import { getOrCreateUserByEmail, normalizeUserEmail, registerUser } from "./userSettingsService.js";

type AccessTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: "user";
  iat: number;
  exp: number;
};

const loginCodeTtlMs = 10 * 60 * 1000;
const loginCodeCooldownMs = 45 * 1000;
const maxLoginCodeAttempts = 5;

type LoginCodeRecord = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

type GoogleTokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  error_description?: string;
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

declare global {
  namespace Express {
    interface Request {
      appUser?: AccessTokenPayload;
    }
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

export async function requestLoginCode(emailInput?: string | null) {
  cleanupExpiredCodes();

  const email = normalizeUserEmail(emailInput);
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

export async function registerAndRequestLoginCode(input: { name?: string | null; email?: string | null }) {
  const user = await registerUser(input);
  return requestLoginCode(user.email);
}

export async function verifyLoginCode(code: string, emailInput?: string | null) {
  cleanupExpiredCodes();

  const email = normalizeUserEmail(emailInput);
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
  const user = await getOrCreateUserByEmail(email);
  return createAccessToken({ userId: user.id, email: user.email, name: user.name });
}

export function createAccessToken(input?: { userId?: string; email?: string; name?: string }) {
  const now = Math.floor(Date.now() / 1000);
  const ttlHours = Number(process.env.APP_AUTH_TOKEN_HOURS ?? 12);
  const email = normalizeUserEmail(input?.email);
  const payload: AccessTokenPayload = {
    sub: input?.userId ?? email,
    email,
    name: input?.name ?? "Trader",
    role: "user",
    iat: now,
    exp: now + Math.max(1, ttlHours) * 60 * 60
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    displayName: payload.name,
    email: payload.email
  };
}

export async function loginWithGoogleCredential(credential?: string | null) {
  const cleanCredential = String(credential ?? "").trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.VITE_GOOGLE_CLIENT_ID?.trim();

  if (!googleClientId) {
    throw new AuthCodeError("Google login is not configured yet. Add GOOGLE_CLIENT_ID in Render, then redeploy.", 503);
  }

  if (!cleanCredential) {
    throw new AuthCodeError("Missing Google sign-in credential.", 400);
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanCredential)}`);
  const profile = (await response.json().catch(() => ({}))) as GoogleTokenInfo;

  if (!response.ok || profile.error_description) {
    throw new AuthCodeError(profile.error_description ?? "Google sign-in could not be verified.", 401);
  }

  if (profile.aud !== googleClientId) {
    throw new AuthCodeError("Google sign-in was issued for a different app.", 401);
  }

  if (!profile.email || profile.email_verified === false || profile.email_verified === "false") {
    throw new AuthCodeError("Google account email is not verified.", 401);
  }

  const user = await getOrCreateUserByEmail(profile.email, {
    name: profile.name,
    avatarUrl: profile.picture,
    authProvider: "google",
    googleSubject: profile.sub
  });

  return createAccessToken({ userId: user.id, email: user.email, name: user.name });
}

export function verifyAccessToken(token?: string | null) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEquals(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenPayload;
    if (!payload.sub || payload.role !== "user") return null;
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

  req.appUser = payload;
  return next();
}
