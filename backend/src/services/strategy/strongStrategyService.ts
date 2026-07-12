import type { MockStock } from "../../data/mockStocks.js";
import { marketDataProvider } from "../marketDataProvider.js";
import type { ProfessionalAssessment } from "../professionalEngine.js";
import { evaluateTrendBreakout, TREND_BREAKOUT_STRATEGY_NAME, type TrendBreakoutEvaluation } from "./trendBreakoutStrategy.js";

export async function evaluateStrongStockStrategy(stock: MockStock, options: { requireIntraday?: boolean } = {}): Promise<TrendBreakoutEvaluation> {
  const [daily, intraday15m, hourly, benchmarkDaily] = await Promise.all([
    marketDataProvider.getChart(stock.ticker, "stocks", "daily"),
    marketDataProvider.getChart(stock.ticker, "stocks", "15m"),
    marketDataProvider.getChart(stock.ticker, "stocks", "1h"),
    marketDataProvider.getChart("SPY", "stocks", "daily")
  ]);
  return evaluateTrendBreakout({
    stock,
    daily,
    intraday15m,
    hourly,
    benchmarkDaily,
    requireIntraday: options.requireIntraday ?? true
  });
}


export function applyStrongStrategyAssessment(assessment: ProfessionalAssessment, setup: TrendBreakoutEvaluation): ProfessionalAssessment {
  const inheritedEmergencyFilters = assessment.hardFilterReasons.filter((reason) =>
    reason.includes("more than 25%") || reason.includes("less than -25%")
  );
  const hardFilterReasons = [...new Set([...inheritedEmergencyFilters, ...setup.blockingReasons])];
  const actionable = setup.actionable && setup.dataQuality === "HIGH";
  const strategyStatus = actionable ? "TESTING" : "NEW";
  const noTradeReasons = actionable
    ? []
    : [...new Set([...setup.blockingReasons, ...setup.warnings])];
  const scoreBreakdown = [
    { label: "Liquidity", score: setup.blockingReasons.some((reason) => reason.startsWith("Requires price")) ? 0 : 10, max: 10, detail: `Bar-derived average dollar volume $${setup.metrics.averageDollarVolume.toLocaleString()}.` },
    { label: "Market regime", score: setup.metrics.benchmarkBullish ? 15 : 0, max: 15, detail: `SPY ${setup.metrics.benchmarkClose}; SMA50 ${setup.metrics.benchmarkSma50}; SMA200 ${setup.metrics.benchmarkSma200}.` },
    { label: "Trend structure", score: setup.confirmations.some((item) => item.startsWith("Stock trend is aligned")) ? 20 : 0, max: 20, detail: `Price ${setup.metrics.stockClose}; EMA20 ${setup.metrics.ema20}; EMA50 ${setup.metrics.ema50}; SMA200 ${setup.metrics.sma200}.` },
    { label: "Breakout and volume", score: (setup.metrics.breakoutPercent >= 0.1 ? 10 : 0) + (setup.metrics.volumeRatio >= 1.35 ? 10 : 0), max: 20, detail: `20-day breakout ${setup.metrics.breakoutPercent}% with ${setup.metrics.volumeRatio}x ${setup.metrics.volumeBasis} volume.` },
    { label: "Relative strength", score: setup.metrics.relativeStrength60d >= 3 ? 10 : 0, max: 10, detail: `${setup.metrics.relativeStrength60d}% versus SPY over 60 sessions.` },
    { label: "Volatility and momentum", score: (setup.metrics.atrPercent >= 1 && setup.metrics.atrPercent <= 6 ? 5 : 0) + (setup.metrics.rsi14 >= 52 && setup.metrics.rsi14 <= 72 ? 5 : 0), max: 10, detail: `ATR ${setup.metrics.atrPercent}% and RSI ${setup.metrics.rsi14}.` },
    { label: "Entry and execution", score: (setup.metrics.closeLocation >= 0.65 && setup.metrics.gapPercent <= 8 ? 3 : 0) + (setup.metrics.extensionAtr >= -0.15 && setup.metrics.extensionAtr <= 0.75 ? 5 : 0) + (setup.metrics.intradayAboveVwap && setup.metrics.intradayAboveEma20 && setup.metrics.hourlyTrendBullish ? 5 : 0) + (setup.metrics.executionWindowOpen ? 2 : 0), max: 15, detail: `Extension ${setup.metrics.extensionAtr} ATR; VWAP ${setup.metrics.intradayVwap}; valid zone ${setup.riskPlan.entryTrigger}-${setup.riskPlan.maxEntryPrice}.` }
  ];

  const checklist = [
    ...assessment.checklist.filter((item) => item.label !== "Catalyst checked" && item.label !== "Strategy proven enough"),
    { label: "Trend Breakout V2 ready", passed: actionable, detail: `${setup.score}/100; ${setup.status}.` },
    { label: "Real 20-day breakout", passed: setup.metrics.breakoutPercent >= 0.1, detail: `Breakout level ${setup.metrics.breakoutLevel}; extension ${setup.metrics.extensionAtr} ATR.` },
    { label: "Broad market regime", passed: setup.metrics.benchmarkBullish, detail: `SPY ${setup.metrics.benchmarkClose}, SMA200 ${setup.metrics.benchmarkSma200}.` },
    { label: "Intraday execution confirmation", passed: setup.metrics.intradayAboveVwap && setup.metrics.intradayAboveEma20 && setup.metrics.hourlyTrendBullish, detail: `VWAP ${setup.metrics.intradayVwap}.` }
  ];

  return {
    ...assessment,
    score: setup.score,
    scoreBreakdown,
    decision: actionable ? "PAPER_TRADE_CANDIDATE" : setup.status === "WATCH" ? "STRONG_WATCH" : "NO_TRADE",
    decisionLabel: actionable ? "Paper Trade Candidate" : setup.status === "WATCH" ? "Strong Watch" : "No Trade",
    marketRegime: {
      state: setup.metrics.benchmarkBullish ? "bullish" : "risk-off",
      score: setup.metrics.benchmarkBullish ? 10 : 0,
      riskOff: !setup.metrics.benchmarkBullish,
      summary: setup.metrics.benchmarkBullish
        ? `SPY trend filter passed: close ${setup.metrics.benchmarkClose} > SMA200 ${setup.metrics.benchmarkSma200}.`
        : "SPY trend filter failed; long breakout entries are blocked."
    },
    strategy: {
      name: TREND_BREAKOUT_STRATEGY_NAME,
      status: strategyStatus,
      reason: actionable
        ? "All Trend Breakout V2 market, trend, breakout, volume, relative-strength, volatility, and execution rules passed."
        : setup.blockingReasons[0] ?? "The setup is not ready.",
      autoTradeAllowed: actionable,
      reducedSize: true
    },
    strategyProof: {
      ...assessment.strategyProof,
      strategyName: TREND_BREAKOUT_STRATEGY_NAME,
      status: strategyStatus,
      summary: actionable
        ? "The deterministic Trend Breakout V2 setup passed. It remains reduced-size until sufficient out-of-sample and paper evidence exists."
        : "Trend Breakout V2 did not pass every mandatory setup rule."
    },
    researchQuality: setup.dataQuality === "HIGH" ? "HIGH QUALITY" : setup.dataQuality === "LIMITED" ? "LIMITED" : "LOW QUALITY",
    confidenceQuality: setup.dataQuality === "HIGH" ? "high" : setup.dataQuality === "LIMITED" ? "limited" : "low",
    riskReward: {
      entry: assessment.riskReward.entry,
      stopLoss: setup.riskPlan.stopLoss,
      takeProfit: setup.riskPlan.takeProfit,
      ratio: setup.riskPlan.riskReward,
      maxLossPercent: assessment.riskReward.entry > 0
        ? Number((((assessment.riskReward.entry - setup.riskPlan.stopLoss) / assessment.riskReward.entry) * 100).toFixed(2))
        : 0
    },
    riskLevel: setup.metrics.atrPercent > 4 || Math.abs(setup.metrics.gapPercent) > 5 ? "Medium" : "Low",
    hardFilterReasons,
    noTradeReasons,
    checklist,
    catalystConfirmed: false,
    liquidityPassed: !setup.blockingReasons.some((reason) => reason.toLowerCase().includes("liquid")),
    evidence: {
      ...assessment.evidence,
      catalystSource: "Catalyst scoring excluded from automatic entries",
      researchProvider: "TradePilot deterministic Trend Breakout V2 engine",
      confidenceQuality: setup.dataQuality === "HIGH" ? "high" : "limited",
      researchQuality: setup.dataQuality === "HIGH" ? "HIGH QUALITY" : setup.dataQuality === "LIMITED" ? "LIMITED" : "LOW QUALITY",
      limitations: [
        "This is a selective long-only trend breakout system; it may remain in cash for long periods.",
        "Backtests and paper results cannot guarantee future profitability.",
        ...setup.warnings
      ]
    },
    strategySetup: setup
  };
}
