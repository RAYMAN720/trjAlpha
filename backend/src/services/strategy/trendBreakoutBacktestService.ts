import type { MockStock } from "../../data/mockStocks.js";
import { marketDataProvider, type MarketChartPoint } from "../marketDataProvider.js";
import { evaluateTrendBreakout, TREND_BREAKOUT_STRATEGY_NAME, atr } from "./trendBreakoutStrategy.js";

export type BacktestTrade = {
  symbol: string;
  sector: string;
  signalTime: string;
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  pnl: number;
  pnlPercent: number;
  rMultiple: number;
  outcome: string;
};

export type TrendBacktestMetrics = {
  strategyName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  averageR: number;
  maxDrawdown: number;
  finalBalance: number;
  trades: BacktestTrade[];
};

type BacktestOptions = {
  startingBalance?: number;
  riskPerTrade?: number;
  slippageBps?: number;
  feeBps?: number;
  maxHoldingBars?: number;
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function backtestTrendBreakoutSymbol(
  stockTemplate: MockStock,
  candles: MarketChartPoint[],
  benchmarkCandles: MarketChartPoint[],
  options: BacktestOptions = {}
): TrendBacktestMetrics {
  const startingBalance = options.startingBalance ?? 10_000;
  const riskPerTrade = options.riskPerTrade ?? 0.005;
  const slippage = (options.slippageBps ?? 8) / 10_000;
  const feeRate = (options.feeBps ?? 2) / 10_000;
  const maxHoldingBars = options.maxHoldingBars ?? 15;
  let balance = startingBalance;
  let peak = balance;
  let maxDrawdown = 0;
  const trades: BacktestTrade[] = [];

  let index = 210;
  while (index < candles.length - 2) {
    const history = candles.slice(0, index + 1);
    const signalCandle = history.at(-1)!;
    const benchmarkHistory = benchmarkCandles.filter((candle) => new Date(candle.date).getTime() <= new Date(signalCandle.date).getTime());
    const stock: MockStock = {
      ...stockTemplate,
      price: signalCandle.close,
      previousClose: history.at(-2)?.close ?? signalCandle.open,
      volume: Math.max(1, Math.round(signalCandle.volume)),
      dailyChangePercent: history.at(-2)?.close
        ? ((signalCandle.close - history.at(-2)!.close) / history.at(-2)!.close) * 100
        : 0,
      quoteSource: "Historical walk-forward candles",
      quoteUpdatedAt: signalCandle.date,
      marketState: "Historical"
    };
    const setup = evaluateTrendBreakout({
      stock,
      daily: history,
      intraday15m: [],
      hourly: [],
      benchmarkDaily: benchmarkHistory,
      requireIntraday: false
    });
    if (!setup.eligible || setup.score < 85) {
      index += 1;
      continue;
    }

    const entryBar = candles[index + 1];
    const rawEntry = entryBar.open * (1 + slippage);
    if (rawEntry > setup.riskPlan.maxEntryPrice || rawEntry < setup.riskPlan.entryTrigger * 0.995) {
      index += 1;
      continue;
    }

    const atr14 = atr(history, 14);
    const stop = Math.max(setup.riskPlan.stopLoss, rawEntry - atr14 * 2, rawEntry * 0.94);
    const initialRisk = rawEntry - stop;
    if (initialRisk <= 0 || initialRisk / rawEntry < 0.004) {
      index += 1;
      continue;
    }
    const target = rawEntry + initialRisk * 2.5;
    const riskBudget = balance * riskPerTrade;
    const quantity = Math.floor(riskBudget / initialRisk);
    if (quantity < 1) {
      index += 1;
      continue;
    }

    let activeStop = stop;
    let exitPrice = entryBar.close;
    let exitIndex = index + 1;
    let outcome = "time_exit";
    const endIndex = Math.min(candles.length - 1, index + 1 + maxHoldingBars);
    for (let futureIndex = index + 1; futureIndex <= endIndex; futureIndex += 1) {
      const bar = candles[futureIndex];
      // Conservative ambiguity rule: if both levels touch in one daily candle, stop is assumed first.
      if (bar.low <= activeStop) {
        exitPrice = activeStop * (1 - slippage);
        exitIndex = futureIndex;
        outcome = activeStop >= rawEntry ? "trailing_stop_profit" : "stop_loss";
        break;
      }
      if (bar.high >= target) {
        exitPrice = target * (1 - slippage);
        exitIndex = futureIndex;
        outcome = "take_profit";
        break;
      }
      const openProfitR = (bar.high - rawEntry) / initialRisk;
      if (openProfitR >= 1) activeStop = Math.max(activeStop, rawEntry * 1.001);
      if (openProfitR >= 1.5) activeStop = Math.max(activeStop, bar.high - atr14 * 1.2);
      exitPrice = bar.close * (1 - slippage);
      exitIndex = futureIndex;
    }

    const entryNotional = rawEntry * quantity;
    const exitNotional = exitPrice * quantity;
    const fees = (entryNotional + exitNotional) * feeRate;
    const pnl = (exitPrice - rawEntry) * quantity - fees;
    balance += pnl;
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - balance) / peak) * 100 : 0);
    trades.push({
      symbol: stock.ticker,
      sector: stock.sector,
      signalTime: signalCandle.date,
      entryTime: entryBar.date,
      exitTime: candles[exitIndex].date,
      entry: round(rawEntry, 4),
      exit: round(exitPrice, 4),
      pnl: round(pnl),
      pnlPercent: round(((exitPrice - rawEntry) / rawEntry) * 100),
      rMultiple: round(pnl / Math.max(0.01, riskBudget)),
      outcome
    });
    index = exitIndex + 1;
  }

  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    strategyName: TREND_BREAKOUT_STRATEGY_NAME,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : grossProfit > 0 ? 99 : 0,
    expectancy: trades.length ? round(trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length) : 0,
    averageR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    maxDrawdown: round(maxDrawdown),
    finalBalance: round(balance),
    trades
  };
}

export async function runTrendBreakoutBacktest(universe: MockStock[]) {
  const benchmark = await marketDataProvider.getChart("SPY", "stocks", "daily");
  const results: TrendBacktestMetrics[] = [];
  for (const stock of universe.filter((item) => item.price >= 10)) {
    const candles = await marketDataProvider.getChart(stock.ticker, "stocks", "daily");
    if (candles.length < 230 || benchmark.length < 230) continue;
    results.push(backtestTrendBreakoutSymbol(stock, candles, benchmark));
  }

  const candidates = results
    .flatMap((result) => result.trades)
    .sort((left, right) => new Date(left.entryTime).getTime() - new Date(right.entryTime).getTime());
  const startingBalance = 10_000;
  const portfolioRiskPerTrade = 0.005;
  const maxConcurrentPositions = 3;
  let equity = startingBalance;
  let peak = equity;
  let maxDrawdown = 0;
  const realized: BacktestTrade[] = [];
  const active: Array<{ trade: BacktestTrade; assignedPnl: number }> = [];

  const settleThrough = (timestamp: number) => {
    const due = active
      .filter(({ trade }) => new Date(trade.exitTime).getTime() <= timestamp)
      .sort((left, right) => new Date(left.trade.exitTime).getTime() - new Date(right.trade.exitTime).getTime());
    for (const item of due) {
      const index = active.indexOf(item);
      if (index >= 0) active.splice(index, 1);
      equity += item.assignedPnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
      realized.push({ ...item.trade, pnl: round(item.assignedPnl) });
    }
  };

  for (const trade of candidates) {
    const entryTimestamp = new Date(trade.entryTime).getTime();
    settleThrough(entryTimestamp);
    if (active.length >= maxConcurrentPositions) continue;
    if (active.some((item) => item.trade.sector === trade.sector)) continue;
    const riskBudget = equity * portfolioRiskPerTrade;
    active.push({ trade, assignedPnl: trade.rMultiple * riskBudget });
  }
  settleThrough(Number.POSITIVE_INFINITY);

  const trades = realized.sort((left, right) => new Date(left.exitTime).getTime() - new Date(right.exitTime).getTime());
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    strategyName: TREND_BREAKOUT_STRATEGY_NAME,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : grossProfit > 0 ? 99 : 0,
    expectancy: trades.length ? round(trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length) : 0,
    averageR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    maxDrawdown: round(maxDrawdown),
    finalBalance: round(equity),
    trades
  } satisfies TrendBacktestMetrics;
}

