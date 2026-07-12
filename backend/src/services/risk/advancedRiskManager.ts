import { prisma } from "../../utils/prisma.js";
import { getOrCreateUserSettings } from "../userSettingsService.js";
import { getTradingSessionStart } from "../marketClockService.js";
import { marketDataProvider, marketForAssetType, normalizeAssetType, type AssetType } from "../marketDataProvider.js";

export type RiskState = "NORMAL" | "CAUTION" | "REDUCED_SIZE" | "PAUSED" | "LOCKED";

const statePriority: Record<RiskState, number> = {
  NORMAL: 0,
  CAUTION: 1,
  REDUCED_SIZE: 2,
  PAUSED: 3,
  LOCKED: 4
};

function strongerState(current: RiskState, next: RiskState): RiskState {
  return statePriority[next] > statePriority[current] ? next : current;
}

function startOfWeek(now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

export function countConsecutiveLosses(trades: Array<{ profitLoss: number }>) {
  let count = 0;
  for (const trade of trades) {
    if (trade.profitLoss >= 0) break;
    count += 1;
  }
  return count;
}

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function getAdvancedRiskStatus(assetType?: AssetType) {
  const user = await getOrCreateUserSettings();
  const normalizedAssetType = assetType ? normalizeAssetType(assetType) : undefined;
  const where = normalizedAssetType ? { assetType: normalizedAssetType } : undefined;
  const now = new Date();
  const dayStart = normalizedAssetType ? getTradingSessionStart(normalizedAssetType, now) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = startOfWeek(now);

  const [openTrades, closedToday, closedWeek, recentClosed, openedToday, account, peakSnapshot] = await Promise.all([
    prisma.paperTrade.findMany({ where: { ...where, status: "Open" }, orderBy: { openedAt: "desc" } }),
    prisma.paperTrade.findMany({ where: { ...where, status: { not: "Open" }, closedAt: { gte: dayStart } } }),
    prisma.paperTrade.findMany({ where: { ...where, status: { not: "Open" }, closedAt: { gte: weekStart } } }),
    prisma.paperTrade.findMany({ where: { ...where, status: { not: "Open" }, closedAt: { not: null } }, orderBy: { closedAt: "desc" }, take: 20 }),
    prisma.paperTrade.count({ where: { ...where, openedAt: { gte: dayStart } } }),
    prisma.paperAccount.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.equitySnapshot.aggregate({ _max: { totalEquity: true } })
  ]);

  const dailyPl = closedToday.reduce((total, trade) => total + trade.profitLoss, 0);
  const weeklyPl = closedWeek.reduce((total, trade) => total + trade.profitLoss, 0);
  const dailyLossLimit = -(user.demoCapital * (user.maxDailyLossPercent / 100));
  const weeklyLossPercent = positiveEnvNumber("MAX_WEEKLY_LOSS_PERCENT", user.maxDailyLossPercent * 2);
  const weeklyLossLimit = -(user.demoCapital * (weeklyLossPercent / 100));
  const maxDailyTrades = Math.max(1, Math.floor(positiveEnvNumber("MAX_DAILY_PAPER_TRADES", 6)));
  const maxConsecutiveLosses = Math.max(2, Math.floor(positiveEnvNumber("MAX_CONSECUTIVE_LOSSES", 3)));
  const drawdownLockPercent = positiveEnvNumber("MAX_ACCOUNT_DRAWDOWN_PERCENT", 10);
  const lossesInRow = countConsecutiveLosses(recentClosed);
  const stockTrades = openTrades.filter((trade) => normalizeAssetType(trade.assetType) === "stock").length;
  const cryptoTrades = openTrades.filter((trade) => normalizeAssetType(trade.assetType) === "crypto").length;
  const peakEquity = Math.max(account?.startingBalance ?? user.demoCapital, peakSnapshot._max.totalEquity ?? 0);
  const currentEquity = account?.totalEquity ?? user.demoCapital;
  const currentDrawdownPercent = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
  const reasons: string[] = [];
  let state: RiskState = "NORMAL";

  if (weeklyPl <= weeklyLossLimit) {
    state = strongerState(state, "LOCKED");
    reasons.push("Weekly loss limit reached. Paper trading is locked for protection.");
  }
  if (currentDrawdownPercent >= drawdownLockPercent) {
    state = strongerState(state, "LOCKED");
    reasons.push(`Account drawdown reached ${currentDrawdownPercent.toFixed(1)}%, above the ${drawdownLockPercent.toFixed(1)}% safety limit.`);
  }
  if (dailyPl <= dailyLossLimit) {
    state = strongerState(state, "PAUSED");
    reasons.push("Daily loss limit reached. Paper trading pauses until the next session.");
  }
  if (lossesInRow >= maxConsecutiveLosses) {
    state = strongerState(state, "PAUSED");
    reasons.push(`${lossesInRow} consecutive losses reached the circuit-breaker threshold.`);
  } else if (lossesInRow >= 2) {
    state = strongerState(state, "REDUCED_SIZE");
    reasons.push("Two consecutive losses: reduce position size by 50%.");
  }
  if (openedToday >= maxDailyTrades) {
    state = strongerState(state, "PAUSED");
    reasons.push(`Daily trade limit reached (${openedToday}/${maxDailyTrades}).`);
  }
  if (openTrades.length >= user.maxOpenTrades) {
    state = strongerState(state, "CAUTION");
    reasons.push("Maximum open trades reached.");
  }
  if (dailyPl > user.demoCapital * 0.02) {
    state = strongerState(state, "CAUTION");
    reasons.push("Daily paper target reached. Avoid giving gains back.");
  }

  const assets = await Promise.all(
    openTrades.map(async (trade) => {
      const market = marketForAssetType(normalizeAssetType(trade.assetType));
      return marketDataProvider.getStock(trade.ticker, market).catch(() => null);
    })
  );
  const sectors = new Map<string, number>();
  for (const asset of assets) {
    const key = asset?.sector ?? "Unknown";
    sectors.set(key, (sectors.get(key) ?? 0) + 1);
  }
  const maxPerSector = Math.max(1, Math.floor(positiveEnvNumber("MAX_OPEN_TRADES_PER_SECTOR", 2)));
  const crowdedSector = [...sectors.entries()].find(([, count]) => count >= maxPerSector);
  if (crowdedSector) {
    state = strongerState(state, "CAUTION");
    reasons.push(`Sector exposure limit reached in ${crowdedSector[0]} (${crowdedSector[1]}/${maxPerSector}).`);
  }

  return {
    state,
    paperOnly: true,
    realTradingEnabled: false,
    maxRiskPerTradePercent: user.riskPerTradePercent,
    maxDailyLossPercent: user.maxDailyLossPercent,
    maxWeeklyLossPercent: weeklyLossPercent,
    maxAccountDrawdownPercent: drawdownLockPercent,
    maxOpenTrades: user.maxOpenTrades,
    maxDailyTrades,
    tradesOpenedToday: openedToday,
    maxConsecutiveLosses,
    maxOpenTradesPerSector: maxPerSector,
    sectorExposure: Object.fromEntries(sectors),
    maxStockTrades: Math.max(1, Math.floor(user.maxOpenTrades * 0.7)),
    maxCryptoTrades: Math.max(1, Math.floor(user.maxOpenTrades * 0.5)),
    openTrades: openTrades.length,
    stockTrades,
    cryptoTrades,
    dailyPl,
    weeklyPl,
    dailyLossLimit,
    weeklyLossLimit,
    lossesInRow,
    peakEquity,
    currentEquity,
    currentDrawdownPercent,
    reducedSizeMultiplier: state === "REDUCED_SIZE" ? 0.5 : 1,
    tradePaused: state === "PAUSED" || state === "LOCKED",
    reasons: reasons.length ? reasons : ["Risk state normal. Continue using paper-trading guardrails."]
  };
}

export async function advancedRiskApproval(input: {
  assetType: AssetType;
  ticker: string;
  sector?: string;
}) {
  const status = await getAdvancedRiskStatus(input.assetType);
  const warnings = [...status.reasons];
  let capacityBlocked = false;

  if (input.assetType === "stock" && status.stockTrades >= status.maxStockTrades) {
    capacityBlocked = true;
    warnings.push("Maximum stock paper-trade exposure reached.");
  }
  if (input.assetType === "crypto" && status.cryptoTrades >= status.maxCryptoTrades) {
    capacityBlocked = true;
    warnings.push("Maximum crypto paper-trade exposure reached.");
  }
  if (input.sector && (status.sectorExposure[input.sector] ?? 0) >= status.maxOpenTradesPerSector) {
    capacityBlocked = true;
    warnings.push(`Maximum paper-trade exposure reached for sector ${input.sector}.`);
  }

  const blocked = status.tradePaused || capacityBlocked;
  return {
    approved: !blocked,
    blocked,
    status,
    warnings
  };
}
