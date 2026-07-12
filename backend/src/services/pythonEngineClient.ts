import type { AssetType } from "./marketDataProvider.js";

export type PythonCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PythonTechnicalAnalysis = {
  trend: "bullish" | "bearish" | "neutral";
  technicalScore: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  volumeConfirmation: boolean;
  support: number;
  resistance: number;
  volatilityRegime: "low" | "normal" | "high";
  warnings: string[];
  indicators: Record<string, unknown>;
  paperTradingOnly: boolean;
  realTradingEnabled: boolean;
};

export type PythonMultiTimeframeResponse = {
  shortTermTrend: "bullish" | "bearish" | "neutral";
  mediumTermTrend: "bullish" | "bearish" | "neutral";
  dailyTrend: "bullish" | "bearish" | "neutral";
  alignment: "aligned" | "mixed" | "conflicting";
  score: number;
  warning: string | null;
  timeframes: Record<string, PythonTechnicalAnalysis>;
  fallbackSafe: boolean;
};

export type PythonEngineStatus = {
  enabled: boolean;
  connected: boolean;
  url: string;
  lastAnalysisAt: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  fallbackActive: boolean;
  engines: {
    indicators: "active" | "unavailable" | "disabled";
    backtesting: "active" | "unavailable" | "disabled";
    risk: "active" | "unavailable" | "disabled";
  };
  paperTradingOnly: true;
  realTradingEnabled: false;
};

const enabled = String(process.env.PYTHON_ENGINE_ENABLED ?? "true").toLowerCase() !== "false";
const baseUrl = (process.env.PYTHON_ENGINE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const timeoutMs = Number(process.env.PYTHON_ENGINE_TIMEOUT_MS ?? 8000);

let lastAnalysisAt: string | null = null;
let lastHealthCheckAt: string | null = null;
let lastError: string | null = null;
let lastConnected = false;

async function requestPython<TResponse>(path: string, body?: unknown): Promise<TResponse> {
  if (!enabled) {
    throw new Error("Python engine disabled.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Python engine ${path} failed with ${response.status}.`);
    }

    lastError = null;
    lastConnected = true;
    return (await response.json()) as TResponse;
  } catch (error) {
    lastConnected = false;
    lastError = error instanceof Error ? error.message : "Python engine request failed.";
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPythonEngineStatus(): Promise<PythonEngineStatus> {
  if (!enabled) {
    return {
      enabled,
      connected: false,
      url: baseUrl,
      lastAnalysisAt,
      lastHealthCheckAt,
      lastError: null,
      fallbackActive: true,
      engines: { indicators: "disabled", backtesting: "disabled", risk: "disabled" },
      paperTradingOnly: true,
      realTradingEnabled: false
    };
  }

  try {
    const health = await requestPython<{
      ok: boolean;
      realTradingEnabled: boolean;
      engines?: Record<string, string>;
    }>("/health");
    lastHealthCheckAt = new Date().toISOString();
    const connected = Boolean(health.ok) && health.realTradingEnabled === false;
    lastConnected = connected;
    return {
      enabled,
      connected,
      url: baseUrl,
      lastAnalysisAt,
      lastHealthCheckAt,
      lastError,
      fallbackActive: !connected,
      engines: {
        indicators: connected ? "active" : "unavailable",
        backtesting: connected ? "active" : "unavailable",
        risk: connected ? "active" : "unavailable"
      },
      paperTradingOnly: true,
      realTradingEnabled: false
    };
  } catch {
    lastHealthCheckAt = new Date().toISOString();
    return {
      enabled,
      connected: false,
      url: baseUrl,
      lastAnalysisAt,
      lastHealthCheckAt,
      lastError,
      fallbackActive: true,
      engines: { indicators: "unavailable", backtesting: "unavailable", risk: "unavailable" },
      paperTradingOnly: true,
      realTradingEnabled: false
    };
  }
}

export async function analyzeMultiTimeframeWithPython(input: {
  symbol: string;
  assetType: AssetType;
  timeframes: Record<string, PythonCandle[]>;
}): Promise<PythonMultiTimeframeResponse | null> {
  if (!enabled) return null;
  try {
    const result = await requestPython<PythonMultiTimeframeResponse>("/analyze/multi-timeframe", input);
    lastAnalysisAt = new Date().toISOString();
    return result;
  } catch (error) {
    console.warn("[python-engine] Multi-timeframe analysis unavailable; using TypeScript fallback.", error instanceof Error ? error.message : error);
    return null;
  }
}

export function getCachedPythonEngineConnectivity() {
  return {
    enabled,
    connected: lastConnected,
    lastAnalysisAt,
    lastError
  };
}
