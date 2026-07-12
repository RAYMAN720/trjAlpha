import { getAIConfig } from "../config.js";
import { createOpenAICompatibleProvider } from "../httpProviders.js";

function chatCompletionsEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

export function createRemoteModelProvider() {
  const config = getAIConfig();
  const configured = Boolean(
    config.localModelProvider !== "none" &&
      config.localModelBaseUrl &&
      config.localModelModel
  );

  return createOpenAICompatibleProvider({
    name: "remote_local",
    endpoint: config.localModelBaseUrl ? chatCompletionsEndpoint(config.localModelBaseUrl) : "",
    apiKey: config.localModelApiKey,
    model: config.localModelModel,
    configured
  });
}

export function createOllamaProvider() {
  const config = getAIConfig();

  return createOpenAICompatibleProvider({
    name: "ollama",
    endpoint: chatCompletionsEndpoint(config.ollamaBaseUrl),
    model: config.ollamaModel,
    configured: config.ollamaEnabled
  });
}
