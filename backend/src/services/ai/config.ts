export type AIProviderRuntimeConfig = {
  primaryProvider: "openai" | "mistral" | "remote_local" | "ollama";
  fallbackProvider: "openai" | "mistral" | "remote_local" | "ollama";
  fallbackEnabled: boolean;
  technicalFallbackEnabled: boolean;
  openaiApiKey?: string;
  openaiModel: string;
  mistralApiKey?: string;
  mistralModel: string;
  localModelProvider: string;
  localModelBaseUrl?: string;
  localModelApiKey?: string;
  localModelModel?: string;
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  maxCallsPerHour: number;
  maxCallsPerDay: number;
  cacheMinutes: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  minSignalScore: number;
  dailyBudgetUsd: number;
  allowTechnicalOnly: boolean;
  requireJsonResponse: boolean;
  paperTradingEnabled: boolean;
  liveBrokerTradingAllowed: boolean;
  autoSubmitBrokerPaperOrders: boolean;
};

function numberEnv(name: string, fallback: number, min = 0) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

function optionalSecret(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function providerEnv(name: string, fallback: AIProviderRuntimeConfig["primaryProvider"]) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "mistral" || value === "remote_local" || value === "ollama" || value === "openai"
    ? value
    : fallback;
}

export function getAIConfig(): AIProviderRuntimeConfig {
  return {
    primaryProvider: providerEnv("AI_PRIMARY_PROVIDER", providerEnv("AI_PROVIDER", "mistral")),
    fallbackProvider: providerEnv("AI_FALLBACK_PROVIDER", "openai"),
    fallbackEnabled: boolEnv("AI_FALLBACK_ENABLED", true),
    technicalFallbackEnabled: boolEnv("TECHNICAL_FALLBACK_ENABLED", boolEnv("AI_ALLOW_TECHNICAL_ONLY", true)),
    openaiApiKey: optionalSecret("OPENAI_API_KEY"),
    openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    mistralApiKey: optionalSecret("MISTRAL_API_KEY"),
    mistralModel: process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest",
    localModelProvider: process.env.LOCAL_MODEL_PROVIDER?.trim() || "none",
    localModelBaseUrl: process.env.LOCAL_MODEL_BASE_URL?.trim() || undefined,
    localModelApiKey: optionalSecret("LOCAL_MODEL_API_KEY"),
    localModelModel: process.env.LOCAL_MODEL_MODEL?.trim() || undefined,
    ollamaEnabled: boolEnv("OLLAMA_ENABLED", false),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || "qwen2.5:7b",
    maxCallsPerHour: Math.floor(numberEnv("AI_MAX_CALLS_PER_HOUR", 10, 0)),
    maxCallsPerDay: Math.floor(numberEnv("AI_MAX_CALLS_PER_DAY", 100, 0)),
    cacheMinutes: numberEnv("AI_CACHE_MINUTES", 60, 0),
    requestTimeoutMs: numberEnv("AI_REQUEST_TIMEOUT_SECONDS", 30, 1) * 1000,
    maxRetries: Math.floor(numberEnv("AI_MAX_RETRIES", 2, 0)),
    retryBaseDelayMs: numberEnv("AI_RETRY_BASE_DELAY_SECONDS", 2, 0.1) * 1000,
    minSignalScore: Math.floor(numberEnv("AI_MIN_SIGNAL_SCORE", 75, 0)),
    dailyBudgetUsd: numberEnv("AI_DAILY_BUDGET_USD", 2, 0),
    allowTechnicalOnly: boolEnv("AI_ALLOW_TECHNICAL_ONLY", true),
    requireJsonResponse: boolEnv("AI_REQUIRE_JSON_RESPONSE", true),
    paperTradingEnabled: boolEnv("PAPER_TRADING_ENABLED", true),
    liveBrokerTradingAllowed: false,
    autoSubmitBrokerPaperOrders: boolEnv("AUTO_SUBMIT_BROKER_PAPER_ORDERS", false)
  };
}

export function getSafeAIConfigView() {
  const config = getAIConfig();
  return {
    primaryProvider: config.primaryProvider,
    fallbackProvider: config.fallbackProvider,
    fallbackEnabled: config.fallbackEnabled,
    technicalFallbackEnabled: config.technicalFallbackEnabled,
    openaiConfigured: Boolean(config.openaiApiKey),
    mistralConfigured: Boolean(config.mistralApiKey),
    remoteLocalConfigured: Boolean(config.localModelBaseUrl && config.localModelModel && config.localModelProvider !== "none"),
    ollamaEnabled: config.ollamaEnabled,
    ollamaConfigured: config.ollamaEnabled,
    localModelProvider: config.localModelProvider,
    openaiModel: config.openaiModel,
    mistralModel: config.mistralModel,
    localModelModel: config.localModelModel ?? null,
    ollamaModel: config.ollamaModel,
    maxCallsPerHour: config.maxCallsPerHour,
    maxCallsPerDay: config.maxCallsPerDay,
    cacheMinutes: config.cacheMinutes,
    requestTimeoutSeconds: config.requestTimeoutMs / 1000,
    maxRetries: config.maxRetries,
    minSignalScore: config.minSignalScore,
    dailyBudgetUsd: config.dailyBudgetUsd,
    allowTechnicalOnly: config.allowTechnicalOnly,
    requireJsonResponse: config.requireJsonResponse,
    paperTradingEnabled: config.paperTradingEnabled,
    liveBrokerTradingAllowed: false,
    autoSubmitBrokerPaperOrders: config.autoSubmitBrokerPaperOrders
  };
}
