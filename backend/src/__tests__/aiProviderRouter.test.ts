import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderError, type AIProvider } from "../services/ai/base.js";
import { analyzeCandidate, candidateInputHash, technicalOnlyAnalysis } from "../services/ai/fallbackRouter.js";
import type { CandidateContext } from "../services/ai/schemas.js";

process.env.AI_MAX_RETRIES = "1";
process.env.AI_RETRY_BASE_DELAY_SECONDS = "0.001";

function candidate(overrides: Partial<CandidateContext> = {}): CandidateContext {
  return {
    candidateId: "signal-1",
    symbol: "NVDA",
    assetClass: "stocks",
    timestamp: "2026-07-10T10:00:00.000Z",
    timeframe: "daily",
    currentPrice: 150,
    technicalIndicators: {
      score: 88,
      signalType: "Momentum breakout",
      dailyChangePercent: 6.2,
      relativeVolume: 2.4,
      volume: 10_000_000,
      averageVolume: 4_200_000,
      fundamentalsQuality: 80,
      valuationScore: 62
    },
    trendState: "Momentum uptrend",
    volatility: "Medium",
    volumeData: {
      volume: 10_000_000,
      averageVolume: 4_200_000,
      relativeVolume: 2.4
    },
    supportResistance: {
      support: 144,
      resistance: 162
    },
    strategyScore: 88,
    signalDirection: "long-watch",
    existingOpenPosition: false,
    marketRegime: "test",
    suppliedNewsSummaries: ["Supplied catalyst only."],
    newsTimestamps: ["2026-07-10T09:55:00.000Z"],
    sourceNames: ["unit-test"],
    accountRiskContext: {
      maxOpenTrades: 5,
      openTrades: 1,
      riskPerTradePercent: 1,
      maxDailyLossPercent: 3
    },
    selectedReason: "Unit test candidate.",
    marketDataTimestamp: "2026-07-10T09:59:00.000Z",
    newsDataHash: "abc",
    strategyVersion: "test-v1",
    ...overrides
  };
}

function provider(
  name: "openai" | "mistral",
  behavior: "success" | "timeout" | "quota" | "malformed" | "auth" | "network" | "reject",
  calls: string[]
): AIProvider {
  return {
    name,
    model: `${name}-test-model`,
    configured: behavior !== "auth",
    async analyze(context, options) {
      calls.push(`${name}:${options?.repair ? "repair" : "first"}:${context.symbol}`);
      if (behavior === "timeout") throw new ProviderError("timeout", "timeout", { retryable: true });
      if (behavior === "quota") throw new ProviderError("quota", "quota", { retryable: true });
      if (behavior === "malformed") throw new ProviderError("bad json", "malformed", { retryable: true });
      if (behavior === "network") throw new ProviderError("network", "network", { retryable: true });
      if (behavior === "auth") throw new ProviderError("auth", "auth", { permanent: true, retryable: false });

      return {
        parsed: {
          recommendation: behavior === "reject" ? "reject" : "approve",
          confidence: behavior === "reject" ? 40 : 86,
          reasoning: ["Provider used supplied data only."],
          risks: ["Risk controls still required."],
          catalysts: ["Supplied catalyst only."],
          invalidation_conditions: ["Breaks support."],
          source_quality: "medium",
          summary: "Structured provider result."
        },
        rawReference: `${name}:mock-ref`,
        latencyMs: 12,
        estimatedCostUsd: 0.0001
      };
    }
  };
}

describe("AI provider fallback router", () => {
  it("uses OpenAI first when it succeeds", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "success", calls), provider("mistral", "success", calls)]
    });

    assert.equal(result.provider, "openai");
    assert.equal(result.recommendation, "approve");
    assert.deepEqual(calls, ["openai:first:NVDA"]);
  });

  it("falls back to Mistral after OpenAI timeout", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "timeout", calls), provider("mistral", "success", calls)]
    });

    assert.equal(result.provider, "mistral");
    assert.equal(result.fallbackUsed, true);
    assert.ok(calls.some((call) => call.startsWith("mistral:first")));
  });

  it("falls back to Mistral after OpenAI quota error", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "quota", calls), provider("mistral", "success", calls)]
    });

    assert.equal(result.provider, "mistral");
    assert.equal(result.status, "success");
  });

  it("uses technical-only mode when both providers are unavailable", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "network", calls), provider("mistral", "network", calls)]
    });

    assert.equal(result.provider, "technical");
    assert.equal(result.technicalOnly, true);
    assert.equal(result.fallbackUsed, true);
  });

  it("retries malformed OpenAI output before falling back", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "malformed", calls), provider("mistral", "success", calls)]
    });

    assert.equal(result.provider, "mistral");
    assert.ok(calls.includes("openai:repair:NVDA"));
  });

  it("uses technical-only mode when both providers return malformed output", async () => {
    const calls: string[] = [];
    const result = await analyzeCandidate(candidate(), {
      persist: false,
      providers: [provider("openai", "malformed", calls), provider("mistral", "malformed", calls)]
    });

    assert.equal(result.provider, "technical");
    assert.equal(result.errorCode, "MALFORMED");
  });

  it("does not call providers for weak deterministic scores", async () => {
    const calls: string[] = [];
    const weak = candidate({
      strategyScore: 55,
      technicalIndicators: { ...candidate().technicalIndicators, score: 55 }
    });
    const result = await analyzeCandidate(weak, {
      persist: false,
      providers: [provider("openai", "success", calls), provider("mistral", "success", calls)]
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.errorCode, "BELOW_MIN_SIGNAL_SCORE");
    assert.deepEqual(calls, []);
  });

  it("generates deterministic technical-only analysis without mock provider branding", () => {
    const result = technicalOnlyAnalysis(candidate(), { errorCode: "NO_PROVIDER_AVAILABLE" });

    assert.equal(result.provider, "technical");
    assert.equal(result.model, "rules-engine");
    assert.equal(result.technicalOnly, true);
  });

  it("builds stable cache keys for unchanged candidate context", () => {
    const left = candidateInputHash(candidate());
    const right = candidateInputHash(candidate());

    assert.equal(left, right);
  });

  it("keeps live broker trading disabled in default env interpretation", async () => {
    const { getAIConfig } = await import("../services/ai/config.js");
    const previous = process.env.ALLOW_LIVE_BROKER_TRADING;
    process.env.ALLOW_LIVE_BROKER_TRADING = "true";
    try {
      assert.equal(getAIConfig().liveBrokerTradingAllowed, false);
    } finally {
      if (previous === undefined) delete process.env.ALLOW_LIVE_BROKER_TRADING;
      else process.env.ALLOW_LIVE_BROKER_TRADING = previous;
    }
  });
});
