import { prisma } from "../utils/prisma.js";
import type { AssetType } from "./marketDataProvider.js";

function levelFor(input: { closedTrades: number; profitFactor: number; maxDrawdown: number; regimesTested: number }) {
  if (input.closedTrades < 30) return "Not enough data";
  if (input.profitFactor < 1) return "Below beginner";
  if (input.profitFactor <= 1.2) return "Beginner/learning";
  if (input.profitFactor <= 1.4 && input.maxDrawdown < 20) return "1-year trader process level";
  if (input.profitFactor <= 1.7 && input.maxDrawdown < 15 && input.closedTrades >= 100) return "3-year trader process level";
  if (input.profitFactor > 1.7 && input.maxDrawdown < 10 && input.closedTrades >= 200 && input.regimesTested >= 3) {
    return "5-year trader process level";
  }
  return "1-year trader process level";
}

async function benchmarkFor(assetType?: AssetType) {
  const where = assetType ? { assetType } : undefined;
  const [trades, performance, scans] = await Promise.all([
    prisma.paperTrade.findMany({ where: { ...where, status: { not: "Open" } } }),
    assetType
      ? prisma.strategyPerformance.findFirst({ where: { scope: "assetType", scopeValue: assetType }, orderBy: { updatedAt: "desc" } })
      : prisma.strategyPerformance.findFirst({ where: { scope: "global", scopeValue: "auto-paper-trading" }, orderBy: { updatedAt: "desc" } }),
    prisma.marketScan.findMany({ where, orderBy: { scanDate: "desc" }, take: 200 })
  ]);
  const closedTrades = trades.length;
  const profitFactor = performance?.profitFactor ?? 0;
  const maxDrawdown = performance?.maxDrawdown ?? 0;
  const regimesTested = new Set(scans.map((scan) => scan.market)).size;
  const level = levelFor({ closedTrades, profitFactor, maxDrawdown, regimesTested });

  return {
    assetType: assetType ?? "overall",
    level,
    closedTrades,
    profitFactor,
    maxDrawdown,
    winRate: performance?.winRate ?? 0,
    regimesTested,
    badges: [
      closedTrades < 30 ? "NOT ENOUGH DATA" : `PROCESS LEVEL: ${level.toUpperCase()}`,
      profitFactor > 1.3 ? "STRATEGY PROVEN" : "STRATEGY TESTING"
    ],
    disclaimer: "Paper trading benchmark does not guarantee real-money performance."
  };
}

export async function getBenchmarkStatus() {
  const [stocks, crypto, overall] = await Promise.all([benchmarkFor("stock"), benchmarkFor("crypto"), benchmarkFor()]);
  return {
    stocks,
    crypto,
    overall,
    generatedAt: new Date().toISOString(),
    realTradingEnabled: false,
    paperOnly: true
  };
}
