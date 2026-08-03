import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";

const D = Prisma.Decimal;

export async function ensureDefaultPortfolio(userId: string) {
  const existing = await prisma.portfolio.findFirst({ where: { userId, isDefault: true, status: "ACTIVE" } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const current = await tx.portfolio.findFirst({ where: { userId, isDefault: true, status: "ACTIVE" } });
    if (current) return current;
    const portfolio = await tx.portfolio.create({
      data: { userId, name: "Main Portfolio", type: "INVESTMENT", baseCurrency: "USD", isDefault: true }
    });
    await tx.cashBalance.create({
      data: { portfolioId: portfolio.id, currency: "USD", available: new D(0), settled: new D(0), reserved: new D(0) }
    });
    return portfolio;
  });
}

export async function listPortfolios(userId: string) {
  await ensureDefaultPortfolio(userId);
  return prisma.portfolio.findMany({
    where: { userId },
    include: {
      cashBalances: true,
      positions: true,
      brokerAccounts: { select: { id: true, provider: true, environment: true, status: true, accountLabel: true, currency: true } }
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });
}

export async function getPortfolio(userId: string, portfolioId: string) {
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    include: {
      cashBalances: true,
      positions: true,
      brokerAccounts: { select: { id: true, provider: true, environment: true, status: true, accountLabel: true, currency: true } },
      orders: { orderBy: { createdAt: "desc" }, take: 100 },
      performance: { orderBy: { capturedAt: "desc" }, take: 365 },
      riskSnapshots: { orderBy: { capturedAt: "desc" }, take: 30 }
    }
  });
  if (!portfolio) {
    const error = new Error("Portfolio not found.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  return portfolio;
}

export async function createPortfolio(userId: string, input: { name: string; type?: string; baseCurrency?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Portfolio name is required.");
  const portfolio = await prisma.portfolio.create({
    data: {
      userId,
      name: name.slice(0, 80),
      type: input.type?.trim().toUpperCase() || "INVESTMENT",
      baseCurrency: input.baseCurrency?.trim().toUpperCase() || "USD"
    }
  });
  await prisma.cashBalance.create({
    data: { portfolioId: portfolio.id, currency: portfolio.baseCurrency, available: new D(0), settled: new D(0), reserved: new D(0) }
  });
  return portfolio;
}
