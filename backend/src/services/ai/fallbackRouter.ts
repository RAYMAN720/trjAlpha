import { createHash, randomUUID } from "node:crypto";
import type { AIAnalysis } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { createAlert } from "../alertService.js";
import { ProviderError, sanitizeProviderError, type AIProvider } from "./base.js";
import { getAIConfig, getSafeAIConfigView } from "./config.js";
import { createMistralProvider, createOpenAIProvider } from "./httpProviders.js";
import { createOllamaProvider, createRemoteModelProvider } from "./providers/remoteModelProvider.js";
import type { AIAnalysisResult, CandidateContext } from "./schemas.js";

type AnalyzeCandidateOptions = {
  providers?: AIProvider[];
  persist?: boolean;
  skipCache?: boolean;
};

const externalProviders = ["openai", "mistral", "remote_local", "ollama"];

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
    return Object.keys(nested)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = (nested as Record<string, unknown>)[key];
        return sorted;
      }, {});
  });
}

export function candidateInputHash(context: CandidateContext) {
  return createHash("sha256")
    .update(
      stableJson({
        symbol: context.symbol,
        timeframe: context.timeframe,
        signalDirection: context.signalDirection,
        strategyVersion: context.strategyVersion,
        score: context.strategyScore,
        marketDataTimestamp: context.marketDataTimestamp,
        newsDataHash: context.newsDataHash,
        technicalIndicators: context.technicalIndicators
      })
    )
    .digest("hex");
}

function inputSummary(context: CandidateContext) {
  return `${context.symbol} ${context.assetClass} ${context.technicalIndicators.signalType} score ${context.strategyScore}, ` +
    `${context.technicalIndicators.relativeVolume}x relative volume, ${context.technicalIndicators.dailyChangePercent}% daily change.`;
}

function analysisFromRecord(record: AIAnalysis, cached = false): AIAnalysisResult {
  const parseArray = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  return {
    provider: record.provider as AIAnalysisResult["provider"],
    model: record.model,
    status: cached ? "cache_hit" : (record.status as AIAnalysisResult["status"]),
    recommendation: record.recommendation as AIAnalysisResult["recommendation"],
    confidence: record.confidence,
    reasoning: parseArray(record.reasoningJson),
    risks: parseArray(record.risksJson),
    catalysts: parseArray(record.catalystsJson),
    invalidationConditions: parseArray(record.invalidationConditionsJson),
    sourceQuality: record.sourceQuality as AIAnalysisResult["sourceQuality"],
    inputSummary: record.inputSummary,
    rawResponseReference: record.rawResponseReference ?? undefined,
    latencyMs: record.latencyMs,
    estimatedCostUsd: record.estimatedCostUsd,
    fallbackUsed: record.fallbackUsed,
    technicalOnly: record.technicalOnly,
    cached,
    errorCode: record.errorCode ?? undefined
  };
}

async function persistAnalysis(context: CandidateContext, inputHash: string, result: AIAnalysisResult, status = result.status) {
  return prisma.aIAnalysis.create({
    data: {
      candidateId: context.candidateId,
      symbol: context.symbol.toUpperCase(),
      provider: result.provider,
      model: result.model,
      status,
      recommendation: result.recommendation,
      confidence: result.confidence,
      reasoningJson: JSON.stringify(result.reasoning),
      risksJson: JSON.stringify(result.risks),
      catalystsJson: JSON.stringify(result.catalysts),
      invalidationConditionsJson: JSON.stringify(result.invalidationConditions),
      sourceQuality: result.sourceQuality,
      inputSummary: result.inputSummary,
      rawResponseReference: result.rawResponseReference,
      inputHash,
      fallbackUsed: result.fallbackUsed,
      technicalOnly: result.technicalOnly,
      cached: Boolean(result.cached),
      latencyMs: result.latencyMs,
      estimatedCostUsd: result.estimatedCostUsd,
      errorCode: result.errorCode
    }
  });
}

async function cachedAnalysis(context: CandidateContext, inputHash: string, persist: boolean) {
  const config = getAIConfig();
  if (config.cacheMinutes <= 0) return null;

  const createdAfter = new Date(Date.now() - config.cacheMinutes * 60_000);
  const cached = await prisma.aIAnalysis.findFirst({
    where: {
      inputHash,
      createdAt: { gte: createdAfter },
      status: { in: ["success", "technical_only", "skipped"] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (!cached) return null;

  const result = analysisFromRecord(cached, true);
  if (persist) {
    const saved = await persistAnalysis(context, inputHash, { ...result, cached: true }, "cache_hit");
    return { ...result, id: saved.id };
  }
  return result;
}

export function technicalOnlyAnalysis(
  context: CandidateContext,
  options: { fallbackUsed?: boolean; errorCode?: string; status?: AIAnalysisResult["status"] } = {}
): AIAnalysisResult {
  const score = context.strategyScore;
  const dailyChange = context.technicalIndicators.dailyChangePercent;
  const relativeVolume = context.technicalIndicators.relativeVolume;
  const stale = Date.now() - new Date(context.marketDataTimestamp).getTime() > 15 * 60_000;
  const risks: string[] = [];

  if (stale) risks.push("Market data is stale.");
  if (dailyChange > 20) risks.push("Asset is already up more than 20%; chase risk is high.");
  if (relativeVolume < 1.5 && context.assetClass === "stocks") risks.push("Relative volume is below the stock minimum threshold.");
  if (relativeVolume < 0.5 && context.assetClass === "crypto") risks.push("Relative volume is below the crypto minimum threshold.");
  if (context.existingOpenPosition) risks.push("An open paper position already exists for this symbol.");
  if (context.technicalIndicators.fundamentalsQuality !== undefined && context.technicalIndicators.fundamentalsQuality < 40) {
    risks.push("Supplied fundamentals quality score is weak.");
  }

  const recommendation: AIAnalysisResult["recommendation"] =
    score < getAIConfig().minSignalScore || dailyChange > 20 || stale
      ? "reject"
      : score >= 85 && risks.length <= 1
        ? "approve"
        : "watch";

  const sourceQuality: AIAnalysisResult["sourceQuality"] =
    stale || context.sourceNames.length === 0 ? "low" : context.suppliedNewsSummaries.length ? "medium" : "medium";

  return {
    provider: "technical",
    model: "rules-engine",
    status: options.status ?? (score < getAIConfig().minSignalScore ? "skipped" : "technical_only"),
    recommendation,
    confidence: Math.max(35, Math.min(85, Math.round(score * 0.8))),
    reasoning: [
      `Deterministic scanner score is ${score}.`,
      `${context.technicalIndicators.signalType} detected from supplied indicators.`,
      `Relative volume is ${relativeVolume}x and daily change is ${dailyChange}%.`
    ],
    risks: risks.length ? risks : ["External AI was unavailable; decision relies only on supplied technical scanner data."],
    catalysts: context.suppliedNewsSummaries.length ? context.suppliedNewsSummaries : ["No supplied external news catalyst."],
    invalidationConditions: [
      "Price loses scanner support level.",
      "Relative volume fades below the configured threshold.",
      "Risk engine blocks the paper-trade plan."
    ],
    sourceQuality,
    inputSummary: inputSummary(context),
    latencyMs: 0,
    estimatedCostUsd: 0,
    fallbackUsed: options.fallbackUsed ?? true,
    technicalOnly: true,
    errorCode: options.errorCode
  };
}

async function usageStats() {
  const hourStart = new Date(Date.now() - 60 * 60_000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [hourly, daily, dailyCost] = await Promise.all([
    prisma.aIAnalysis.count({
      where: { provider: { in: externalProviders }, status: "success", cached: false, createdAt: { gte: hourStart } }
    }),
    prisma.aIAnalysis.count({
      where: { provider: { in: externalProviders }, status: "success", cached: false, createdAt: { gte: dayStart } }
    }),
    prisma.aIAnalysis.aggregate({
      where: { provider: { in: externalProviders }, status: "success", cached: false, createdAt: { gte: dayStart } },
      _sum: { estimatedCostUsd: true }
    })
  ]);

  return {
    hourlyCalls: hourly,
    dailyCalls: daily,
    dailyCostUsd: Number((dailyCost._sum.estimatedCostUsd ?? 0).toFixed(6))
  };
}

async function recordProviderSuccess(provider: AIProvider) {
  await prisma.aIProviderHealth.upsert({
    where: { provider: provider.name },
    update: {
      healthy: true,
      lastSuccessAt: new Date(),
      failureCount: 0,
      disabledUntil: null,
      lastErrorCode: null
    },
    create: {
      provider: provider.name,
      healthy: true,
      lastSuccessAt: new Date()
    }
  });
}

function cooldownFor(error: ProviderError) {
  if (error.kind === "auth" || error.kind === "config") return 60 * 60_000;
  if (error.kind === "quota") return 20 * 60_000;
  if (error.kind === "malformed") return 2 * 60_000;
  return 5 * 60_000;
}

async function recordProviderFailure(provider: AIProvider, error: unknown) {
  const safe = sanitizeProviderError(error);
  const disabledUntil =
    error instanceof ProviderError && (error.permanent || error.kind === "quota")
      ? new Date(Date.now() + cooldownFor(error))
      : error instanceof ProviderError
        ? new Date(Date.now() + cooldownFor(error))
        : new Date(Date.now() + 5 * 60_000);

  const existing = await prisma.aIProviderHealth.findUnique({ where: { provider: provider.name } });
  await prisma.aIProviderHealth.upsert({
    where: { provider: provider.name },
    update: {
      healthy: false,
      lastFailureAt: new Date(),
      failureCount: (existing?.failureCount ?? 0) + 1,
      disabledUntil,
      lastErrorCode: safe.code
    },
    create: {
      provider: provider.name,
      healthy: false,
      lastFailureAt: new Date(),
      failureCount: 1,
      disabledUntil,
      lastErrorCode: safe.code
    }
  });

  return safe.code;
}

async function providerAvailable(provider: AIProvider) {
  if (!provider.configured) return { available: false, code: "MISSING_API_KEY" };

  const health = await prisma.aIProviderHealth.findUnique({ where: { provider: provider.name } });
  if (health?.disabledUntil && health.disabledUntil > new Date()) {
    return { available: false, code: health.lastErrorCode ?? "PROVIDER_COOLDOWN" };
  }

  return { available: true };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs: number) {
  return baseMs + Math.floor(Math.random() * Math.max(100, baseMs * 0.4));
}

async function callProviderWithRetry(provider: AIProvider, context: CandidateContext) {
  const config = getAIConfig();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await provider.analyze(context, { repair: attempt > 0 });
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) break;
      if (attempt >= config.maxRetries) break;
      await sleep(jitter(config.retryBaseDelayMs * 2 ** attempt));
    }
  }

  throw lastError ?? new ProviderError("Provider failed.", "unknown", { retryable: true });
}

async function budgetGate() {
  const config = getAIConfig();
  const usage = await usageStats();

  if (usage.hourlyCalls >= config.maxCallsPerHour) return { allowed: false, code: "HOURLY_LIMIT_REACHED", usage };
  if (usage.dailyCalls >= config.maxCallsPerDay) return { allowed: false, code: "DAILY_LIMIT_REACHED", usage };
  if (usage.dailyCostUsd >= config.dailyBudgetUsd) return { allowed: false, code: "DAILY_BUDGET_REACHED", usage };

  return { allowed: true, code: null, usage };
}

async function createBudgetWarning(code: string) {
  await createAlert({
    ticker: "SYSTEM",
    alertType: "risk warning",
    severity: "Warning",
    message: `External AI paused: ${code}. Technical-only analysis remains active.`
  });
}

function providerCatalog() {
  return {
    openai: createOpenAIProvider(),
    mistral: createMistralProvider(),
    remote_local: createRemoteModelProvider(),
    ollama: createOllamaProvider()
  };
}

function defaultProviderOrder() {
  const config = getAIConfig();
  const catalog = providerCatalog();
  const names = [
    config.primaryProvider,
    ...(config.fallbackEnabled ? [config.fallbackProvider] : []),
    "openai",
    "mistral",
    "remote_local",
    "ollama"
  ] as Array<keyof ReturnType<typeof providerCatalog>>;

  return [...new Set(names)].map((name) => catalog[name]);
}

export async function analyzeCandidate(context: CandidateContext, options: AnalyzeCandidateOptions = {}): Promise<AIAnalysisResult & { id?: string }> {
  const config = getAIConfig();
  const persist = options.persist ?? true;
  const inputHash = candidateInputHash(context);

  if (!options.skipCache && persist) {
    const cached = await cachedAnalysis(context, inputHash, persist);
    if (cached) return cached;
  }

  if (context.strategyScore < config.minSignalScore) {
    const result = technicalOnlyAnalysis(context, {
      fallbackUsed: false,
      errorCode: "BELOW_MIN_SIGNAL_SCORE",
      status: "skipped"
    });
    const saved = persist ? await persistAnalysis(context, inputHash, result, "skipped") : null;
    return { ...result, id: saved?.id };
  }

  if (persist) {
    const gate = await budgetGate();
    if (!gate.allowed) {
      const code = gate.code ?? "AI_LIMIT_REACHED";
      await createBudgetWarning(code);
      const result = technicalOnlyAnalysis(context, { fallbackUsed: true, errorCode: code });
      const saved = await persistAnalysis(context, inputHash, result, "technical_only");
      return { ...result, id: saved.id };
    }
  }

  const providers = options.providers ?? defaultProviderOrder();
  const ordered = providers.filter((provider) => provider.configured || !persist);
  let lastErrorCode: string | undefined;

  for (const provider of ordered) {
    const available = persist ? await providerAvailable(provider) : { available: provider.configured, code: "MISSING_API_KEY" };
    if (!available.available) {
      lastErrorCode = available.code;
      continue;
    }

    try {
      const response = await callProviderWithRetry(provider, context);
      const result: AIAnalysisResult = {
        provider: provider.name,
        model: provider.model,
        status: "success",
        recommendation: response.parsed.recommendation,
        confidence: response.parsed.confidence,
        reasoning: response.parsed.reasoning,
        risks: response.parsed.risks,
        catalysts: response.parsed.catalysts,
        invalidationConditions: response.parsed.invalidation_conditions,
        sourceQuality: response.parsed.source_quality,
        inputSummary: response.parsed.summary || inputSummary(context),
        rawResponseReference: response.rawReference,
        latencyMs: response.latencyMs,
        estimatedCostUsd: response.estimatedCostUsd,
        fallbackUsed: provider.name !== "openai",
        technicalOnly: false
      };
      if (persist) await recordProviderSuccess(provider);
      const saved = persist ? await persistAnalysis(context, inputHash, result, "success") : null;
      return { ...result, id: saved?.id };
    } catch (error) {
      lastErrorCode = persist ? await recordProviderFailure(provider, error) : sanitizeProviderError(error).code;
    }
  }

  const result = technicalOnlyAnalysis(context, {
    fallbackUsed: true,
    errorCode: lastErrorCode ?? "NO_PROVIDER_AVAILABLE"
  });
  const saved = persist ? await persistAnalysis(context, inputHash, result, "technical_only") : null;
  return { ...result, id: saved?.id };
}

function aiModeFor(analysis?: AIAnalysis | null) {
  if (!analysis) return "TECHNICAL_ONLY";
  if (analysis.cached) return "CACHED_RESEARCH";
  if (analysis.technicalOnly || analysis.provider === "technical") return "TECHNICAL_ONLY";
  if (analysis.provider === "remote_local") return "REMOTE_LOCAL_MODEL";
  if (analysis.provider === "ollama") return "OLLAMA_LOCAL";
  return "AI_ENHANCED";
}

function diagnosticHint(input: {
  provider: string;
  configured: boolean;
  lastErrorCode?: string | null;
  disabledUntil?: Date | null;
  model: string;
}) {
  if (!input.configured) return `Set ${input.provider === "openai" ? "OPENAI_API_KEY" : input.provider === "mistral" ? "MISTRAL_API_KEY" : "provider API key"} in Render, then redeploy.`;
  if (!input.lastErrorCode) return `${input.provider} has not reported an error yet. Run a fresh research scan to test it.`;
  if (input.lastErrorCode === "AUTH") return `${input.provider} key is rejected. Create a new key in the correct project, save it in Render, and redeploy.`;
  if (input.lastErrorCode === "QUOTA") return `${input.provider} quota, credits, billing, or rate limit is blocking calls. Check billing/usage for the key's project.`;
  if (input.lastErrorCode === "MODEL") return `${input.provider} model ${input.model} is not available to this key/project. Change the model env var or enable access.`;
  if (input.lastErrorCode === "NETWORK" || input.lastErrorCode === "TIMEOUT") return `${input.provider} request could not complete from Render. Retry after cooldown or check provider status.`;
  if (input.lastErrorCode === "OUTAGE") return `${input.provider} returned a server outage. Fallback stays active.`;
  if (input.lastErrorCode === "DAILY_BUDGET_REACHED") return `TradePilot AI_DAILY_BUDGET_USD has been reached. Increase it in Render if you want more external AI calls.`;
  if (input.lastErrorCode === "HOURLY_LIMIT_REACHED" || input.lastErrorCode === "DAILY_LIMIT_REACHED") return `TradePilot external AI call limit is reached. Increase AI_MAX_CALLS_PER_HOUR or AI_MAX_CALLS_PER_DAY if needed.`;
  if (input.disabledUntil && input.disabledUntil > new Date()) return `${input.provider} is cooling down after an error until ${input.disabledUntil.toISOString()}.`;
  return `${input.provider} failed with ${input.lastErrorCode}. Check Render logs for the provider response code.`;
}

function providerDiagnostics(input: {
  config: ReturnType<typeof getAIConfig>;
  openaiHealth?: Awaited<ReturnType<typeof prisma.aIProviderHealth.findMany>>[number];
  mistralHealth?: Awaited<ReturnType<typeof prisma.aIProviderHealth.findMany>>[number];
  remoteHealth?: Awaited<ReturnType<typeof prisma.aIProviderHealth.findMany>>[number];
  ollamaHealth?: Awaited<ReturnType<typeof prisma.aIProviderHealth.findMany>>[number];
}) {
  const rows = [
    {
      provider: "openai",
      configured: Boolean(input.config.openaiApiKey),
      model: input.config.openaiModel,
      health: input.openaiHealth
    },
    {
      provider: "mistral",
      configured: Boolean(input.config.mistralApiKey),
      model: input.config.mistralModel,
      health: input.mistralHealth
    },
    {
      provider: "remote_local",
      configured: Boolean(input.config.localModelBaseUrl && input.config.localModelModel && input.config.localModelProvider !== "none"),
      model: input.config.localModelModel ?? input.config.localModelProvider,
      health: input.remoteHealth
    },
    {
      provider: "ollama",
      configured: input.config.ollamaEnabled,
      model: input.config.ollamaModel,
      health: input.ollamaHealth
    }
  ];

  return rows.map((row) => ({
    provider: row.provider,
    configured: row.configured,
    model: row.model,
    status: row.health?.healthy === false ? "Unavailable" : row.health ? "Healthy" : row.configured ? "Not checked" : "Not configured",
    lastErrorCode: row.health?.lastErrorCode ?? (!row.configured ? "MISSING_API_KEY" : null),
    lastFailureAt: row.health?.lastFailureAt ?? null,
    lastSuccessAt: row.health?.lastSuccessAt ?? null,
    disabledUntil: row.health?.disabledUntil ?? null,
    hint: diagnosticHint({
      provider: row.provider,
      configured: row.configured,
      lastErrorCode: row.health?.lastErrorCode ?? (!row.configured ? "MISSING_API_KEY" : null),
      disabledUntil: row.health?.disabledUntil,
      model: row.model
    })
  }));
}

export async function getAIStatus() {
  const [health, usage, lastExternal, lastAnalysis, recentAnalyses, cacheHits, totalAnalyses, workerLock] = await Promise.all([
    prisma.aIProviderHealth.findMany({ orderBy: { provider: "asc" } }),
    usageStats(),
    prisma.aIAnalysis.findFirst({
      where: { provider: { in: externalProviders }, status: "success" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.aIAnalysis.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.aIAnalysis.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.aIAnalysis.count({ where: { cached: true } }),
    prisma.aIAnalysis.count(),
    prisma.workerLock.findFirst({ orderBy: { heartbeatAt: "desc" } })
  ]);

  const config = getAIConfig();
  const openaiHealth = health.find((item) => item.provider === "openai");
  const mistralHealth = health.find((item) => item.provider === "mistral");
  const remoteHealth = health.find((item) => item.provider === "remote_local");
  const ollamaHealth = health.find((item) => item.provider === "ollama");
  const latestError = [...health]
    .filter((item) => item.lastErrorCode)
    .sort((left, right) => (right.lastFailureAt?.getTime() ?? 0) - (left.lastFailureAt?.getTime() ?? 0))[0];

  return {
    config: getSafeAIConfigView(),
    mode: aiModeFor(lastAnalysis),
    primaryProvider: config.primaryProvider,
    fallbackProvider: config.fallbackProvider,
    providerHealth: health,
    primaryProviderStatus: openaiHealth?.healthy === false ? "Unavailable" : openaiHealth ? "Healthy" : "Not checked",
    fallbackProviderStatus: mistralHealth?.healthy === false ? "Unavailable" : mistralHealth ? "Healthy" : "Not checked",
    remoteProviderStatus: remoteHealth?.healthy === false ? "Unavailable" : remoteHealth ? "Healthy" : config.localModelBaseUrl ? "Not checked" : "Not configured",
    ollamaProviderStatus: ollamaHealth?.healthy === false ? "Unavailable" : ollamaHealth ? "Healthy" : config.ollamaEnabled ? "Not checked" : "Disabled",
    providerDiagnostics: providerDiagnostics({ config, openaiHealth, mistralHealth, remoteHealth, ollamaHealth }),
    lastSuccessfulExternalCall: lastExternal?.createdAt ?? null,
    hourlyCalls: usage.hourlyCalls,
    dailyCalls: usage.dailyCalls,
    dailyEstimatedCostUsd: usage.dailyCostUsd,
    dailyBudgetUsd: config.dailyBudgetUsd,
    technicalOnlyActive:
      aiModeFor(lastAnalysis) === "TECHNICAL_ONLY" ||
      (!config.openaiApiKey &&
        !config.mistralApiKey &&
        !(config.localModelBaseUrl && config.localModelModel) &&
        !config.ollamaEnabled),
    lastAIError: latestError?.lastErrorCode ?? null,
    cacheHitRate: totalAnalyses ? Number(((cacheHits / totalAnalyses) * 100).toFixed(1)) : 0,
    workerHeartbeatAt: workerLock?.heartbeatAt ?? null,
    recentAnalyses: recentAnalyses.map((analysis) => ({
      id: analysis.id,
      symbol: analysis.symbol,
      provider: analysis.provider,
      model: analysis.model,
      status: analysis.status,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      sourceQuality: analysis.sourceQuality,
      fallbackUsed: analysis.fallbackUsed,
      technicalOnly: analysis.technicalOnly,
      cached: analysis.cached,
      errorCode: analysis.errorCode,
      createdAt: analysis.createdAt
    })),
    requestId: randomUUID()
  };
}
