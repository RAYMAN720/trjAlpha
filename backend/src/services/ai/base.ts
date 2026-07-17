import type { CandidateContext, AIProviderJson } from "./schemas.js";

export type ProviderFailureKind = "auth" | "quota" | "timeout" | "malformed" | "network" | "outage" | "config" | "model" | "unknown";
export type AIProviderName = "openai" | "mistral" | "remote_local" | "ollama" | "technical";

export class ProviderError extends Error {
  kind: ProviderFailureKind;
  permanent: boolean;
  retryable: boolean;

  constructor(message: string, kind: ProviderFailureKind, options: { permanent?: boolean; retryable?: boolean } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.permanent = options.permanent ?? kind === "auth";
    this.retryable = options.retryable ?? !this.permanent;
  }
}

export type AIProviderResponse = {
  parsed: AIProviderJson;
  rawReference: string;
  latencyMs: number;
  estimatedCostUsd: number;
};

export interface AIProvider {
  name: Exclude<AIProviderName, "technical">;
  model: string;
  configured: boolean;
  analyze(context: CandidateContext, options?: { repair?: boolean }): Promise<AIProviderResponse>;
}

export function sanitizeProviderError(error: unknown) {
  if (error instanceof ProviderError) {
    return {
      code: error.kind.toUpperCase(),
      retryable: error.retryable,
      permanent: error.permanent
    };
  }

  return {
    code: "UNKNOWN",
    retryable: true,
    permanent: false
  };
}
