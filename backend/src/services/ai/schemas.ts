import { z } from "zod";

export const aiRecommendationSchema = z.enum(["approve", "reject", "watch"]);
export const sourceQualitySchema = z.enum(["high", "medium", "low"]);

export const aiProviderJsonSchema = z.object({
  recommendation: aiRecommendationSchema,
  confidence: z.number().int().min(0).max(100),
  reasoning: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  catalysts: z.array(z.string()).default([]),
  invalidation_conditions: z.array(z.string()).default([]),
  source_quality: sourceQualitySchema,
  summary: z.string().min(1)
});

export type AIProviderJson = z.infer<typeof aiProviderJsonSchema>;
export type AIProviderName = "openai" | "mistral" | "remote_local" | "ollama" | "technical";
export type AIAnalysisStatus = "success" | "technical_only" | "cache_hit" | "skipped" | "error";

export type CandidateContext = {
  candidateId?: string;
  symbol: string;
  assetClass: "stocks" | "crypto";
  timestamp: string;
  timeframe: string;
  currentPrice: number;
  technicalIndicators: {
    score: number;
    signalType: string;
    dailyChangePercent: number;
    relativeVolume: number;
    volume: number;
    averageVolume: number;
    fundamentalsQuality?: number;
    valuationScore?: number;
  };
  trendState: string;
  volatility: string;
  volumeData: {
    volume: number;
    averageVolume: number;
    relativeVolume: number;
  };
  supportResistance: {
    support?: number;
    resistance?: number;
  };
  strategyScore: number;
  signalDirection: string;
  existingOpenPosition: boolean;
  marketRegime: string;
  suppliedNewsSummaries: string[];
  newsTimestamps: string[];
  sourceNames: string[];
  accountRiskContext: {
    maxOpenTrades: number;
    openTrades: number;
    riskPerTradePercent: number;
    maxDailyLossPercent: number;
  };
  selectedReason: string;
  marketDataTimestamp: string;
  newsDataHash?: string;
  strategyVersion: string;
};

export type AIAnalysisResult = {
  provider: AIProviderName;
  model: string;
  status: AIAnalysisStatus;
  recommendation: "approve" | "reject" | "watch";
  confidence: number;
  reasoning: string[];
  risks: string[];
  catalysts: string[];
  invalidationConditions: string[];
  sourceQuality: "high" | "medium" | "low";
  inputSummary: string;
  rawResponseReference?: string;
  latencyMs: number;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
  technicalOnly: boolean;
  cached?: boolean;
  errorCode?: string;
};

export function parseAIProviderJson(payload: unknown): AIProviderJson {
  return aiProviderJsonSchema.parse(payload);
}
