import { createHash } from "node:crypto";
import { ProviderError, type AIProvider, type AIProviderName, type AIProviderResponse } from "./base.js";
import { getAIConfig } from "./config.js";
import { buildProviderMessages } from "./prompts.js";
import { parseAIProviderJson, type CandidateContext } from "./schemas.js";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  id?: string;
};

function responseReference(provider: string, model: string, content: string) {
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `${provider}:${model}:${digest}`;
}

function classifyHttpFailure(status: number, body: string) {
  const normalized = body.toLowerCase();
  if (normalized.includes("invalid_api_key") || normalized.includes("incorrect api key") || normalized.includes("api key")) {
    return new ProviderError("Provider authentication failed.", "auth", { permanent: true, retryable: false });
  }
  if (normalized.includes("insufficient_quota") || normalized.includes("quota") || normalized.includes("billing") || normalized.includes("credit")) {
    return new ProviderError("Provider quota or billing limit reached.", "quota", { retryable: true });
  }
  if (normalized.includes("model_not_found") || normalized.includes("model") && (normalized.includes("does not exist") || normalized.includes("not found") || normalized.includes("access"))) {
    return new ProviderError("Provider model is unavailable or not enabled for this project.", "model", { permanent: true, retryable: false });
  }
  if (status === 401 || status === 403) {
    return new ProviderError("Provider authentication failed.", "auth", { permanent: true, retryable: false });
  }
  if (status === 429) {
    return new ProviderError("Provider quota or billing limit reached.", "quota", { retryable: true });
  }
  if (status >= 500) {
    return new ProviderError("Provider outage.", "outage", { retryable: true });
  }
  return new ProviderError(`Provider request failed with status ${status}.`, "unknown", { retryable: status >= 400 });
}

function estimateCostUsd(provider: AIProviderName, model: string, usage?: ChatCompletionResponse["usage"]) {
  const tokens = usage?.total_tokens ?? 0;
  if (!tokens) return 0;

  const perMillion =
    provider === "openai"
      ? model.includes("gpt-4o-mini")
        ? 0.6
        : 5
      : provider === "mistral"
        ? 0.5
        : 0;

  return Number(((tokens / 1_000_000) * perMillion).toFixed(6));
}

async function postChatCompletion(input: {
  provider: Exclude<AIProviderName, "technical">;
  endpoint: string;
  apiKey?: string;
  model: string;
  context: CandidateContext;
  timeoutMs: number;
  repair?: boolean;
}): Promise<AIProviderResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(input.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: buildProviderMessages(input.context, input.repair).map((message) => ({
          role: message.role,
          content: message.content
        }))
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw classifyHttpFailure(response.status, text);
    }

    const data = JSON.parse(text) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError("Provider returned an empty response.", "malformed", { retryable: true });
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch {
      throw new ProviderError("Provider returned invalid JSON.", "malformed", { retryable: true });
    }

    const parsed = parseAIProviderJson(parsedContent);
    return {
      parsed,
      rawReference: responseReference(input.provider, input.model, content),
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: estimateCostUsd(input.provider, input.model, data.usage)
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Provider request timed out.", "timeout", { retryable: true });
    }
    throw new ProviderError("Provider network request failed.", "network", { retryable: true });
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenAIProvider(): AIProvider {
  const config = getAIConfig();
  return {
    name: "openai",
    model: config.openaiModel,
    configured: Boolean(config.openaiApiKey),
    analyze(context, options) {
      if (!config.openaiApiKey) {
        throw new ProviderError("OpenAI API key missing.", "config", { permanent: true, retryable: false });
      }

      return postChatCompletion({
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        context,
        timeoutMs: config.requestTimeoutMs,
        repair: options?.repair
      });
    }
  };
}

export function createMistralProvider(): AIProvider {
  const config = getAIConfig();
  return {
    name: "mistral",
    model: config.mistralModel,
    configured: Boolean(config.mistralApiKey),
    analyze(context, options) {
      if (!config.mistralApiKey) {
        throw new ProviderError("Mistral API key missing.", "config", { permanent: true, retryable: false });
      }

      return postChatCompletion({
        provider: "mistral",
        endpoint: "https://api.mistral.ai/v1/chat/completions",
        apiKey: config.mistralApiKey,
        model: config.mistralModel,
        context,
        timeoutMs: config.requestTimeoutMs,
        repair: options?.repair
      });
    }
  };
}

export function createOpenAICompatibleProvider(input: {
  name: Exclude<AIProviderName, "technical" | "openai" | "mistral">;
  endpoint: string;
  apiKey?: string;
  model?: string;
  configured: boolean;
}): AIProvider {
  const config = getAIConfig();
  return {
    name: input.name,
    model: input.model ?? "openai-compatible-model",
    configured: input.configured,
    analyze(context, options) {
      if (!input.configured || !input.endpoint || !input.model) {
        throw new ProviderError(`${input.name} provider is not configured.`, "config", { permanent: true, retryable: false });
      }

      return postChatCompletion({
        provider: input.name,
        endpoint: input.endpoint,
        apiKey: input.apiKey,
        model: input.model,
        context,
        timeoutMs: config.requestTimeoutMs,
        repair: options?.repair
      });
    }
  };
}
