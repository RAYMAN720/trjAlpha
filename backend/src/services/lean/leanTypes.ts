export type LeanMode = "BACKTEST" | "PAPER";
export type LeanJobStatus = "QUEUED" | "STARTING" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";

export type LeanEngineCapability = {
  key: string;
  name: string;
  enabled: boolean;
  implementation: "LEAN" | "TRADEPILOT" | "SHARED";
  description: string;
};

export type LeanEngineStatus = {
  configured: boolean;
  reachable: boolean;
  mode: "PAPER_ONLY";
  provider: "QuantConnect LEAN";
  engineImage: string;
  gatewayUrl: string | null;
  algorithm: string;
  algorithmVersion: string;
  architecture: string[];
  capabilities: LeanEngineCapability[];
  warning?: string;
  gateway?: unknown;
};

export type LeanBacktestRequest = {
  startDate: string;
  endDate: string;
  initialCash?: number;
  benchmark?: string;
  symbols?: string[];
  parameters?: Record<string, string | number | boolean>;
};

export type LeanPaperRequest = {
  symbols?: string[];
  initialCash?: number;
  parameters?: Record<string, string | number | boolean>;
};

export type LeanJob = {
  id: string;
  mode: LeanMode;
  status: LeanJobStatus;
  algorithm: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  containerId?: string | null;
  resultPath?: string | null;
  error?: string | null;
  request?: unknown;
  summary?: Record<string, unknown> | null;
};
