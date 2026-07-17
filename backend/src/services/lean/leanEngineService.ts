import type {
  LeanBacktestRequest,
  LeanEngineStatus,
  LeanJob,
  LeanPaperRequest
} from "./leanTypes.js";

const gatewayUrl = (process.env.LEAN_ENGINE_URL ?? "").replace(/\/$/, "");
const gatewayToken = process.env.LEAN_ENGINE_TOKEN ?? "";
const engineImage = process.env.LEAN_ENGINE_IMAGE ?? "quantconnect/lean:latest";
const algorithm = process.env.LEAN_ALGORITHM_NAME ?? "TradePilotLeanAlgorithm";
const algorithmVersion = process.env.LEAN_ALGORITHM_VERSION ?? "1.1.0";
const requestTimeoutMs = Number(process.env.LEAN_ENGINE_TIMEOUT_MS ?? 15_000);

const architecture = [
  "Data feed and subscriptions",
  "Universe selection",
  "Alpha model",
  "Portfolio construction",
  "Risk management",
  "Execution model",
  "Transaction and order events",
  "Portfolio accounting",
  "Backtest and paper brokerage adapters",
  "Result and statistics pipeline"
];

const capabilities: LeanEngineStatus["capabilities"] = [
  {
    key: "shared-algorithm",
    name: "Shared algorithm lifecycle",
    enabled: true,
    implementation: "LEAN",
    description: "The same C# QCAlgorithm is used for backtests and Alpaca paper execution."
  },
  {
    key: "event-driven",
    name: "Event-driven processing",
    enabled: true,
    implementation: "LEAN",
    description: "LEAN processes market slices, order events, scheduled events and corporate actions."
  },
  {
    key: "reality-modeling",
    name: "Reality models",
    enabled: true,
    implementation: "LEAN",
    description: "Fill, fee, slippage, buying-power and settlement models are handled by LEAN plug-ins."
  },
  {
    key: "risk-overlay",
    name: "TradePilot professional risk overlay",
    enabled: true,
    implementation: "SHARED",
    description: "TradePilot emergency halt and desk rules remain an additional fail-closed layer."
  },
  {
    key: "ai-research",
    name: "AI research layer",
    enabled: true,
    implementation: "TRADEPILOT",
    description: "AI can enrich research but cannot bypass deterministic LEAN and TradePilot risk rules."
  },
  {
    key: "live-money",
    name: "Live-money execution",
    enabled: false,
    implementation: "SHARED",
    description: "This edition is hard-locked to Alpaca paper trading."
  }
];

async function gatewayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!gatewayUrl) {
    throw new Error("LEAN_ENGINE_URL is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${gatewayUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(gatewayToken ? { authorization: `Bearer ${gatewayToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `LEAN gateway returned ${response.status}.`;
      throw new Error(message);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLeanEngineStatus(): Promise<LeanEngineStatus> {
  if (!gatewayUrl) {
    return {
      configured: false,
      reachable: false,
      mode: "PAPER_ONLY",
      provider: "QuantConnect LEAN",
      engineImage,
      gatewayUrl: null,
      algorithm,
      algorithmVersion,
      architecture,
      capabilities,
      warning: "LEAN gateway is not configured. Research and the dashboard remain available, but no LEAN backtest or automated paper session can start."
    };
  }

  try {
    const gateway = await gatewayRequest<unknown>("/health");
    return {
      configured: true,
      reachable: true,
      mode: "PAPER_ONLY",
      provider: "QuantConnect LEAN",
      engineImage,
      gatewayUrl,
      algorithm,
      algorithmVersion,
      architecture,
      capabilities,
      gateway
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      mode: "PAPER_ONLY",
      provider: "QuantConnect LEAN",
      engineImage,
      gatewayUrl,
      algorithm,
      algorithmVersion,
      architecture,
      capabilities,
      warning: error instanceof Error ? error.message : "LEAN gateway is unreachable."
    };
  }
}

export async function submitLeanBacktest(request: LeanBacktestRequest): Promise<LeanJob> {
  return gatewayRequest<LeanJob>("/jobs/backtest", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function startLeanPaperTrading(request: LeanPaperRequest): Promise<LeanJob> {
  if ((process.env.ALLOW_LIVE_BROKER_TRADING ?? "false").toLowerCase() === "true") {
    throw new Error("TradePilot LEAN Edition refuses to start while live-money trading is enabled.");
  }
  return gatewayRequest<LeanJob>("/jobs/paper", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function listLeanJobs(): Promise<LeanJob[]> {
  if (!gatewayUrl) return [];
  return gatewayRequest<LeanJob[]>("/jobs");
}

export async function getLeanJob(id: string): Promise<LeanJob> {
  return gatewayRequest<LeanJob>(`/jobs/${encodeURIComponent(id)}`);
}

export async function stopLeanJob(id: string): Promise<LeanJob> {
  return gatewayRequest<LeanJob>(`/jobs/${encodeURIComponent(id)}/stop`, { method: "POST" });
}
