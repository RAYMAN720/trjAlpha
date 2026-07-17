import { prisma } from "../utils/prisma.js";
import type { ProfessionalAssessment, StrategyStatus } from "./professionalEngine.js";

function statusFromProof(input: {
  current: StrategyStatus;
  backtestTrades: number;
  paperTrades: number;
  backtestProfitFactor: number;
  paperProfitFactor: number;
  maxDrawdown: number;
}) {
  if (input.current === "DISABLED") return input.current;

  if (
    input.backtestTrades >= 200 &&
    input.paperTrades >= 100 &&
    input.backtestProfitFactor >= 1.4 &&
    input.paperProfitFactor >= 1.3 &&
    input.maxDrawdown <= 12
  ) {
    return "PROVEN";
  }

  if (input.paperTrades >= 30 && (input.paperProfitFactor < 0.9 || input.maxDrawdown > 15)) {
    return "WEAK";
  }

  return input.current;
}

export async function enrichStrategyProof(assessment: ProfessionalAssessment): Promise<ProfessionalAssessment> {
  const [performance, backtest] = await Promise.all([
    prisma.strategyPerformance.findFirst({
      where: { scope: "strategy", scopeValue: assessment.strategy.name },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.backtestResult.findFirst({
      where: {
        assetType: assessment.assetType,
        strategyName: assessment.strategy.name
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const backtestTrades = backtest?.totalTrades ?? 0;
  const paperTrades = performance?.tradeCount ?? 0;
  const paperProfitFactor = performance?.profitFactor ?? 0;
  const backtestProfitFactor = backtest?.profitFactor ?? 0;
  const maxDrawdown = Math.max(performance?.maxDrawdown ?? 0, backtest?.maxDrawdown ?? 0);
  const status = statusFromProof({
    current: assessment.strategy.status,
    backtestTrades,
    paperTrades,
    backtestProfitFactor,
    paperProfitFactor,
    maxDrawdown
  });
  const autoTradeAllowed =
    assessment.score >= 85 &&
    !assessment.hardFilterReasons.length &&
    !assessment.marketRegime.riskOff &&
    Boolean(assessment.strategySetup?.actionable) &&
    (status === "TESTING" || status === "PROVEN");
  const noTradeReasons = assessment.noTradeReasons.filter(
    (reason) => !reason.startsWith("Strategy is new") && !reason.startsWith("Strategy is weak")
  );

  if (status === "NEW") noTradeReasons.push("Strategy is new and can only create watchlist ideas.");
  if (status === "WEAK" || status === "DISABLED") noTradeReasons.push("Strategy is weak or disabled by the strategy gate.");

  return {
    ...assessment,
    strategy: {
      ...assessment.strategy,
      status,
      autoTradeAllowed,
      reducedSize: status === "TESTING"
    },
    strategyProof: {
      ...assessment.strategyProof,
      status,
      backtestTrades,
      paperTrades,
      winRate: performance?.winRate ?? backtest?.winRate ?? 0,
      profitFactor: paperProfitFactor || backtestProfitFactor,
      maxDrawdown,
      bestAssetType: assessment.assetType,
      summary:
        status === "PROVEN"
          ? "Strategy passed strict proof gates: at least 200 historical trades, 100 paper trades, stronger profit-factor thresholds, and maximum drawdown no greater than 12%."
          : status === "WEAK"
            ? "Strategy is weak based on stored paper-trading performance or drawdown."
            : assessment.strategyProof.summary
    },
    noTradeReasons
  };
}
