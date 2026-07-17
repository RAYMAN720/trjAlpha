import { prisma } from "../../utils/prisma.js";
import type { AssetType } from "../marketDataProvider.js";
import { cryptoPlaybooks } from "./cryptoPlaybooks.js";
import type { PlaybookDefinition, PlaybookStatus, StrategyProofLevel } from "./playbookTypes.js";
import { stockPlaybooks } from "./stockPlaybooks.js";

export function getPlaybookDefinitions(assetType?: AssetType) {
  const all = [...stockPlaybooks, ...cryptoPlaybooks];
  return assetType ? all.filter((playbook) => playbook.assetType === assetType) : all;
}

function proofLevel(input: {
  enabled: boolean;
  closedTrades: number;
  profitFactor: number;
  maxDrawdown: number;
  averageWin: number;
  averageLoss: number;
}): StrategyProofLevel {
  if (!input.enabled) return "DISABLED";
  if (
    input.closedTrades >= 30 &&
    input.profitFactor > 1.3 &&
    input.maxDrawdown < 15 &&
    input.averageWin > input.averageLoss
  ) {
    return "PAPER_PROVEN";
  }
  if (input.closedTrades > 0) return "PAPER_TESTING";
  return "UNTESTED";
}

async function decoratePlaybook(playbook: PlaybookDefinition): Promise<PlaybookStatus> {
  const [performance, trades] = await Promise.all([
    prisma.strategyPerformance.findFirst({
      where: { scope: "assetType", scopeValue: playbook.assetType },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.paperTrade.findMany({
      where: { assetType: playbook.assetType, status: { not: "Open" } },
      orderBy: { closedAt: "desc" },
      take: 10
    })
  ]);

  const level = proofLevel({
    enabled: playbook.enabled,
    closedTrades: performance?.tradeCount ?? trades.length,
    profitFactor: performance?.profitFactor ?? 0,
    maxDrawdown: performance?.maxDrawdown ?? 0,
    averageWin: performance?.averageGain ?? 0,
    averageLoss: performance?.averageLoss ?? 0
  });
  const status =
    level === "DISABLED"
      ? "Disabled"
      : level === "PAPER_PROVEN"
        ? "Enabled"
        : performance && performance.profitFactor < 1 && performance.tradeCount >= 5
          ? "Weak"
          : "Testing";

  return {
    ...playbook,
    proofLevel: level,
    status,
    winRate: performance?.winRate ?? 0,
    profitFactor: performance?.profitFactor ?? 0,
    maxDrawdown: performance?.maxDrawdown ?? 0,
    last10Trades: trades.map((trade) => ({ ticker: trade.ticker, result: trade.profitLoss, closedAt: trade.closedAt })),
    paperOnly: true
  };
}

export async function getPlaybooksStatus(assetType?: AssetType) {
  const playbooks = await Promise.all(getPlaybookDefinitions(assetType).map(decoratePlaybook));
  return {
    paperOnly: true,
    realTradingEnabled: false,
    playbooks
  };
}

export function findPlaybookByName(name: string, assetType: AssetType) {
  return getPlaybookDefinitions(assetType).find((playbook) => playbook.name === name) ?? null;
}
