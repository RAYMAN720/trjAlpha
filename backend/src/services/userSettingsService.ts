import { prisma } from "../utils/prisma.js";

const defaultUserEmail = "demo@tradepilot.local";
const defaultUserName = "Demo User";

export function normalizeUserEmail(email?: string | null) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : defaultUserEmail;
}

export function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] || "Trader";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Trader";
}

function cleanDisplayName(name?: string | null) {
  const cleaned = String(name ?? "").trim().replace(/\s+/g, " ");
  return cleaned.length >= 2 ? cleaned.slice(0, 80) : null;
}

export async function getOrCreateUserByEmail(email?: string | null, input?: { name?: string | null; avatarUrl?: string | null; authProvider?: string; googleSubject?: string | null }) {
  const normalizedEmail = normalizeUserEmail(email);
  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      ...(input?.name ? { name: cleanDisplayName(input.name) ?? displayNameFromEmail(normalizedEmail) } : {}),
      ...(input?.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      ...(input?.authProvider ? { authProvider: input.authProvider } : {}),
      ...(input?.googleSubject ? { googleSubject: input.googleSubject } : {}),
      lastLoginAt: new Date()
    },
    create: {
      name: cleanDisplayName(input?.name) ?? (normalizedEmail === defaultUserEmail ? defaultUserName : displayNameFromEmail(normalizedEmail)),
      email: normalizedEmail,
      avatarUrl: input?.avatarUrl ?? null,
      authProvider: input?.authProvider ?? "email",
      googleSubject: input?.googleSubject ?? null,
      lastLoginAt: new Date(),
      displayCurrency: "USD",
      realTradingEnabled: false,
      autoPaperTrading: true
    }
  });
}

export async function getOrCreateUserSettings(userId?: string | null) {
  if (userId) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) return existing;
  }

  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  return getOrCreateUserByEmail(defaultUserEmail);
}

export async function registerUser(input: { name?: string | null; email?: string | null }) {
  const email = normalizeUserEmail(input.email);
  if (email === defaultUserEmail && String(input.email ?? "").trim().toLowerCase() !== defaultUserEmail) {
    throw new Error("Enter a valid email address.");
  }
  const name = cleanDisplayName(input.name) ?? displayNameFromEmail(email);
  return getOrCreateUserByEmail(email, { name, authProvider: "email" });
}

export async function getUserProfile(userId: string) {
  const user = await getOrCreateUserSettings(userId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    authProvider: user.authProvider,
    displayCurrency: user.displayCurrency,
    demoCapital: user.demoCapital,
    riskPerTradePercent: user.riskPerTradePercent,
    maxOpenTrades: user.maxOpenTrades,
    maxDailyLossPercent: user.maxDailyLossPercent,
    beginnerMode: user.beginnerMode,
    autoPaperTrading: user.autoPaperTrading,
    realTradingEnabled: false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

export async function updateUserProfile(userId: string, input: {
  name?: string | null;
  displayCurrency?: string | null;
  demoCapital?: number;
  riskPerTradePercent?: number;
  maxOpenTrades?: number;
  maxDailyLossPercent?: number;
  beginnerMode?: boolean;
  autoPaperTrading?: boolean;
}) {
  const name = input.name === undefined ? undefined : cleanDisplayName(input.name);
  const displayCurrency = String(input.displayCurrency ?? "USD").toUpperCase() === "USD" ? "USD" : "USD";
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name ? { name } : {}),
      displayCurrency,
      ...(typeof input.demoCapital === "number" ? { demoCapital: Math.max(100, input.demoCapital) } : {}),
      ...(typeof input.riskPerTradePercent === "number" ? { riskPerTradePercent: Math.min(5, Math.max(0.1, input.riskPerTradePercent)) } : {}),
      ...(typeof input.maxOpenTrades === "number" ? { maxOpenTrades: Math.min(20, Math.max(1, Math.round(input.maxOpenTrades))) } : {}),
      ...(typeof input.maxDailyLossPercent === "number" ? { maxDailyLossPercent: Math.min(20, Math.max(0.5, input.maxDailyLossPercent)) } : {}),
      ...(typeof input.beginnerMode === "boolean" ? { beginnerMode: input.beginnerMode } : {}),
      ...(typeof input.autoPaperTrading === "boolean" ? { autoPaperTrading: input.autoPaperTrading } : {}),
      realTradingEnabled: false
    }
  });
  return getUserProfile(user.id);
}
