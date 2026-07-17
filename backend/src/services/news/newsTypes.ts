import type { AssetType } from "../marketDataProvider.js";

export type NewsDecision = "NO_ACTION" | "WATCH" | "STRONG_WATCH" | "PAPER_TRADE_CANDIDATE" | "BLOCKED_BY_RISK";
export type NewsSentiment = "bullish" | "bearish" | "neutral";

export type MarketNewsItem = {
  id: string;
  assetType: AssetType;
  ticker: string;
  symbol: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  sentiment: NewsSentiment;
  impactLevel: "low" | "medium" | "high" | "critical";
  catalystType: string;
  timeSensitivity: "low" | "medium" | "high";
  bullishInterpretation: string;
  bearishInterpretation: string;
  riskWarning: string;
  scoreImpact: number;
  decision: NewsDecision;
  confidence: number;
  dataQuality: "NEWS CONFIRMED" | "NEWS UNCONFIRMED" | "FALLBACK MODE";
};

export type NewsScanResult = {
  provider: string;
  status: "ok" | "fallback";
  scannedAt: string;
  count: number;
  items: MarketNewsItem[];
  warning?: string;
};
