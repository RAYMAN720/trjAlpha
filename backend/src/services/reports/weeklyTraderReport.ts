import { prisma } from "../../utils/prisma.js";
import { getBenchmarkStatus } from "../benchmarkService.js";

function weekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function profitFactor(wins: number, losses: number) {
  return losses > 0 ? wins / losses : wins > 0 ? wins : 0;
}

export async function generateWeeklyTraderReport() {
  const since = weekStart();
  const [trades, riskEvents, benchmark] = await Promise.all([
    prisma.paperTrade.findMany({ where: { openedAt: { gte: since } }, orderBy: { openedAt: "desc" } }),
    prisma.riskEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    getBenchmarkStatus()
  ]);
  const closed = trades.filter((trade) => trade.status !== "Open");
  const wins = closed.filter((trade) => trade.profitLoss > 0);
  const losses = closed.filter((trade) => trade.profitLoss < 0);
  const totalProfit = closed.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalWins = wins.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalLosses = Math.abs(losses.reduce((total, trade) => total + trade.profitLoss, 0));
  const byTicker = [...closed].sort((left, right) => right.profitLoss - left.profitLoss);
  const blockedRiskyTrades = riskEvents.filter((event) => event.blocked).length;
  const noTradeDecisions = riskEvents.filter((event) => event.message.toLowerCase().includes("no trade") || event.blocked).length;

  return {
    generatedAt: new Date().toISOString(),
    periodStart: since.toISOString(),
    totalTrades: trades.length,
    closedTrades: closed.length,
    winRate: closed.length ? Number((wins.length / closed.length * 100).toFixed(1)) : 0,
    profitFactor: Number(profitFactor(totalWins, totalLosses).toFixed(2)),
    profitLoss: Number(totalProfit.toFixed(2)),
    maxDrawdown: Math.max(benchmark.overall.maxDrawdown, benchmark.stocks.maxDrawdown, benchmark.crypto.maxDrawdown),
    bestStrategy: "Collecting strategy-tagged outcomes",
    worstStrategy: "Collecting strategy-tagged outcomes",
    biggestMistake: riskEvents[0]?.message ?? "No major risk mistake recorded this week.",
    bestSetup: byTicker[0] ? `${byTicker[0].ticker} paper trade` : "No closed setup yet.",
    noTradeDecisions,
    blockedRiskyTrades,
    stockVsCryptoPerformance: {
      stocks: benchmark.stocks,
      crypto: benchmark.crypto
    },
    recommendationsForNextWeek: [
      "Only approve paper trades that pass the professional checklist.",
      "Do not force trades when no-trade mode is active.",
      "Let weak or new strategies collect proof before trusting them.",
      "Keep real trading disabled."
    ],
    disclaimer: "Paper trading report does not guarantee real-money performance."
  };
}
