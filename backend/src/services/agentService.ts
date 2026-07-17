import { prisma } from "../utils/prisma.js";
import type { MockStock } from "../data/mockStocks.js";
import type { AssetType } from "./marketDataProvider.js";

type SignalLike = {
  assetType?: AssetType | string;
  ticker: string;
  signalType: string;
  score: number;
  riskLevel: string;
  decision: string;
  explanation: string;
  price: number;
  dailyChangePercent: number;
  relativeVolume: number;
};

async function recordAgentRun<T>(input: {
  assetType?: AssetType;
  agentName: string;
  jobName?: string;
  inputTicker?: string;
  inputJson: unknown;
  output: T;
  summary: string;
}) {
  await prisma.agentRun.create({
    data: {
      assetType: input.assetType ?? "stock",
      agentName: input.agentName,
      jobName: input.jobName,
      status: "Success",
      inputTicker: input.inputTicker,
      inputJson: JSON.stringify(input.inputJson),
      outputSummary: input.summary,
      outputJson: JSON.stringify(input.output)
    }
  });

  return input.output;
}

export async function recordAgentError(input: {
  assetType?: AssetType;
  agentName: string;
  jobName?: string;
  inputTicker?: string;
  inputJson: unknown;
  error: unknown;
}) {
  const message = input.error instanceof Error ? input.error.message : "Unknown agent error";
  await prisma.agentRun.create({
    data: {
      assetType: input.assetType ?? "stock",
      agentName: input.agentName,
      jobName: input.jobName,
      status: "Error",
      inputTicker: input.inputTicker,
      inputJson: JSON.stringify(input.inputJson),
      outputSummary: "Agent failed.",
      outputJson: "{}",
      error: message
    }
  });
}

export async function marketScannerAgent(signal: SignalLike, jobName?: string) {
  const output = {
    ticker: signal.ticker,
    unusualVolume: signal.relativeVolume >= 1.5,
    momentumBreakout: signal.dailyChangePercent > 5 && signal.relativeVolume > 2,
    oversoldRebound: signal.dailyChangePercent < -7,
    highRiskPump: signal.dailyChangePercent > 20,
    sectorStrength: signal.signalType === "Sector strength",
    opportunityScore: signal.score,
    summary: `${signal.ticker} scored ${signal.score} with ${signal.signalType.toLowerCase()} and ${signal.relativeVolume.toFixed(2)}x volume.`
  };

  return recordAgentRun({
    assetType: signal.assetType === "crypto" ? "crypto" : "stock",
    agentName: "marketScannerAgent",
    jobName,
    inputTicker: signal.ticker,
    inputJson: signal,
    output,
    summary: output.summary
  });
}

export async function newsAgent(stock: MockStock, jobName?: string) {
  const output = {
    ticker: stock.ticker,
    catalyst: stock.newsCatalyst,
    sentiment: stock.newsCatalyst ? "Constructive but unverified" : "No major catalyst",
    sourceCount: stock.newsCatalyst ? 2 : 0,
    confidence: stock.newsCatalyst ? 68 : 35,
    summary: stock.newsCatalyst || "No mock news catalyst was detected."
  };

  return recordAgentRun({
    agentName: "newsAgent",
    jobName,
    inputTicker: stock.ticker,
    inputJson: stock,
    output,
    summary: output.summary
  });
}

export async function fundamentalAgent(stock: MockStock, jobName?: string) {
  const output = {
    ticker: stock.ticker,
    qualityScore: stock.fundamentalsQuality,
    valuationScore: stock.valuationScore,
    marketCap: stock.marketCap,
    balance: stock.fundamentalsQuality >= 70 ? "Quality supports research" : "Fundamentals require caution",
    summary: `${stock.ticker} has mock fundamentals quality ${stock.fundamentalsQuality}/100 and valuation ${stock.valuationScore}/100.`
  };

  return recordAgentRun({
    agentName: "fundamentalAgent",
    jobName,
    inputTicker: stock.ticker,
    inputJson: stock,
    output,
    summary: output.summary
  });
}

export async function technicalAgent(signal: SignalLike, jobName?: string) {
  const output = {
    ticker: signal.ticker,
    trend: signal.dailyChangePercent > 0 ? "Uptrend day" : "Downtrend day",
    relativeVolume: signal.relativeVolume,
    momentumScore: Math.max(0, Math.min(100, Math.round(50 + signal.dailyChangePercent * 3))),
    invalidation: signal.price * (signal.riskLevel === "High" ? 0.92 : signal.riskLevel === "Medium" ? 0.94 : 0.96),
    summary: `${signal.ticker} technical setup is ${signal.signalType.toLowerCase()} with ${signal.dailyChangePercent.toFixed(2)}% daily change.`
  };

  return recordAgentRun({
    agentName: "technicalAgent",
    jobName,
    inputTicker: signal.ticker,
    inputJson: signal,
    output,
    summary: output.summary
  });
}

export async function riskAgent(input: { assetType?: AssetType; ticker: string; blocked: boolean; reasons: string[]; riskLevel: string }, jobName?: string) {
  const output = {
    ticker: input.ticker,
    blocked: input.blocked,
    reasons: input.reasons,
    riskLevel: input.riskLevel,
    summary: input.blocked
      ? `${input.ticker} blocked by risk engine: ${input.reasons.join("; ")}`
      : `${input.ticker} passed paper-trading risk checks.`
  };

  return recordAgentRun({
    assetType: input.assetType,
    agentName: "riskAgent",
    jobName,
    inputTicker: input.ticker,
    inputJson: input,
    output,
    summary: output.summary
  });
}

export async function decisionAgent(input: { ticker: string; score: number; riskLevel: string; signalType: string }, jobName?: string) {
  const blocked = input.riskLevel === "High" || input.score < 75;
  const output = {
    ticker: input.ticker,
    finalDecision: blocked ? "Watch or avoid; no auto paper trade" : "Eligible for risk-checked paper trade",
    adjustedScore: input.riskLevel === "Medium" ? Math.max(0, input.score - 4) : input.score,
    confidence: Math.max(45, Math.min(86, Math.round(input.score * 0.82))),
    blocked,
    summary: blocked
      ? `${input.ticker} remains research-only after decision review.`
      : `${input.ticker} passed decision review for automatic paper trading.`
  };

  return recordAgentRun({
    agentName: "decisionAgent",
    jobName,
    inputTicker: input.ticker,
    inputJson: input,
    output,
    summary: output.summary
  });
}

export async function paperTradingAgent(input: { assetType?: AssetType; ticker: string; action: string; reason: string }, jobName?: string) {
  const output = {
    ticker: input.ticker,
    action: input.action,
    realTradingEnabled: false,
    paperTradingOnly: true,
    summary: `${input.action} for ${input.ticker}: ${input.reason}`
  };

  return recordAgentRun({
    assetType: input.assetType,
    agentName: "paperTradingAgent",
    jobName,
    inputTicker: input.ticker,
    inputJson: input,
    output,
    summary: output.summary
  });
}

export async function learningAgent(input: { assetType?: AssetType; insight: string; confidence: number; category: string }, jobName?: string) {
  const output = {
    ...input,
    summary: input.insight
  };

  return recordAgentRun({
    assetType: input.assetType,
    agentName: "learningAgent",
    jobName,
    inputJson: input,
    output,
    summary: output.summary
  });
}
