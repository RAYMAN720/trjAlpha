import { prisma } from "../utils/prisma.js";
import { createAlert } from "./alertService.js";
import { blockRealTradingAttempt } from "./riskEngineService.js";

type BrokerEnvironment = "paper" | "live";
type AlpacaAuthMode = "api_key" | "oauth_client_credentials";

type BrokerConfig = {
  provider: "alpaca";
  environment: BrokerEnvironment;
  authMode: AlpacaAuthMode;
  baseUrl: string;
  authBaseUrl: string;
  keyId?: string;
  secretKey?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  configured: boolean;
  oauthConfigured: boolean;
  liveTradingAllowed: boolean;
};

type OrderInput = {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  orderType?: "market" | "limit";
  timeInForce?: "day" | "gtc";
  limitPrice?: number;
  stopPrice?: number;
  takeProfitPrice?: number;
  source: string;
  tradePlanId?: string;
  paperTradeId?: string;
  confirmationText?: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: "Bearer";
};

let cachedOAuthToken: { accessToken: string; expiresAt: number } | null = null;

function defaultAlpacaTradingBaseUrl(environment: BrokerEnvironment) {
  return environment === "live" ? "https://api.alpaca.markets/v2" : "https://paper-api.alpaca.markets/v2";
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildAlpacaTradingUrl(baseUrl: string, path: string) {
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  let cleanPath = path.startsWith("/") ? path : `/${path}`;
  const baseIncludesVersion = /\/v2$/i.test(cleanBaseUrl);
  const pathIncludesVersion = cleanPath === "/v2" || cleanPath.startsWith("/v2/");

  if (baseIncludesVersion && pathIncludesVersion) {
    cleanPath = cleanPath.replace(/^\/v2/i, "") || "/";
  }

  if (!baseIncludesVersion && !pathIncludesVersion) {
    cleanPath = `/v2${cleanPath}`;
  }

  return `${cleanBaseUrl}${cleanPath}`;
}

export function getBrokerConfig(): BrokerConfig {
  const environment = process.env.ALPACA_TRADING_ENV === "live" ? "live" : "paper";
  const authMode: AlpacaAuthMode =
    process.env.ALPACA_AUTH_MODE === "oauth_client_credentials" ? "oauth_client_credentials" : "api_key";
  const oauthConfigured = Boolean(process.env.ALPACA_OAUTH_CLIENT_ID?.trim() && process.env.ALPACA_OAUTH_CLIENT_SECRET?.trim());
  const apiKeyConfigured = Boolean(process.env.ALPACA_API_KEY_ID?.trim() && process.env.ALPACA_API_SECRET_KEY?.trim());

  return {
    provider: "alpaca",
    environment,
    authMode,
    baseUrl: normalizeBaseUrl(process.env.ALPACA_TRADING_BASE_URL?.trim() || defaultAlpacaTradingBaseUrl(environment)),
    authBaseUrl:
      process.env.ALPACA_AUTH_BASE_URL?.trim() ??
      (environment === "live" ? "https://authx.alpaca.markets/v1" : "https://authx.sandbox.alpaca.markets/v1"),
    keyId: process.env.ALPACA_API_KEY_ID?.trim(),
    secretKey: process.env.ALPACA_API_SECRET_KEY?.trim(),
    oauthClientId: process.env.ALPACA_OAUTH_CLIENT_ID?.trim(),
    oauthClientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET?.trim(),
    configured: authMode === "oauth_client_credentials" ? oauthConfigured : apiKeyConfigured,
    oauthConfigured,
    liveTradingAllowed: process.env.ALLOW_LIVE_BROKER_TRADING === "true"
  };
}

async function issueOAuthClientCredentialsToken() {
  const config = getBrokerConfig();
  if (!config.oauthClientId || !config.oauthClientSecret) {
    throw new Error("Alpaca OAuth client credentials are not configured.");
  }

  if (cachedOAuthToken && cachedOAuthToken.expiresAt > Date.now() + 30_000) {
    return cachedOAuthToken.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.oauthClientId,
    client_secret: config.oauthClientSecret
  });

  const response = await fetch(`${config.authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = (await response.json()) as Partial<TokenResponse> & { error?: string };

  if (!response.ok || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? `Alpaca AuthX token request failed with status ${response.status}.`);
  }

  cachedOAuthToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };

  return data.access_token;
}

async function getAlpacaAuthHeaders(): Promise<Record<string, string>> {
  const config = getBrokerConfig();
  if (config.authMode === "oauth_client_credentials") {
    const token = await issueOAuthClientCredentialsToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`
    };
    return headers;
  }

  if (!config.keyId || !config.secretKey) {
    throw new Error("Alpaca API key credentials are not configured.");
  }

  const headers: Record<string, string> = {
    "APCA-API-KEY-ID": config.keyId,
    "APCA-API-SECRET-KEY": config.secretKey
  };
  return headers;
}

async function updateConnection(data: Partial<{
  status: string;
  accountNumber: string;
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  lastError: string | null;
}>) {
  const config = getBrokerConfig();
  return prisma.brokerConnection.upsert({
    where: {
      provider_environment: {
        provider: config.provider,
        environment: config.environment
      }
    },
    update: {
      ...data,
      isLive: config.environment === "live",
      liveTradingAllowed: config.liveTradingAllowed,
      lastSyncAt: new Date()
    },
    create: {
      provider: config.provider,
      environment: config.environment,
      status: data.status ?? "Unknown",
      accountNumber: data.accountNumber,
      currency: data.currency,
      buyingPower: data.buyingPower,
      cash: data.cash,
      portfolioValue: data.portfolioValue,
      isLive: config.environment === "live",
      liveTradingAllowed: config.liveTradingAllowed,
      lastError: data.lastError,
      lastSyncAt: new Date()
    }
  });
}

async function alpacaRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<{ data: T; requestId?: string }> {
  const config = getBrokerConfig();
  if (!config.configured) {
    throw new Error("Alpaca credentials are not configured.");
  }
  const authHeaders: Record<string, string> = await getAlpacaAuthHeaders();

  const response = await fetch(buildAlpacaTradingUrl(config.baseUrl, path), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.message ?? data.error ?? `Alpaca API error ${response.status}`);
  }

  return {
    data: data as T,
    requestId: response.headers.get("X-Request-ID") ?? undefined
  };
}

export async function getBrokerStatus() {
  const config = getBrokerConfig();
  const connection = await prisma.brokerConnection.findUnique({
    where: {
      provider_environment: {
        provider: config.provider,
        environment: config.environment
      }
    }
  });

  return {
    provider: config.provider,
    environment: config.environment,
    configured: config.configured,
    authMode: config.authMode,
    oauthConfigured: config.oauthConfigured,
    baseUrl: config.baseUrl,
    authBaseUrl: config.authBaseUrl,
    paperTradingReady: config.environment === "paper" && config.configured,
    realTradingEnabled: false,
    liveTradingAllowed: false,
    connection
  };
}

export async function syncBrokerAccount() {
  const config = getBrokerConfig();
  if (!config.configured) {
    const connection = await updateConnection({
      status: "Missing credentials",
      lastError:
        config.authMode === "oauth_client_credentials"
          ? "Set ALPACA_OAUTH_CLIENT_ID and ALPACA_OAUTH_CLIENT_SECRET in backend/.env."
          : "Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in backend/.env."
    });
    return { configured: false, connection };
  }

  try {
    const { data, requestId } = await alpacaRequest<Record<string, string>>("/v2/account");
    const connection = await updateConnection({
      status: data.status ?? "Unknown",
      accountNumber: data.account_number,
      currency: data.currency,
      buyingPower: Number(data.buying_power ?? 0),
      cash: Number(data.cash ?? 0),
      portfolioValue: Number(data.portfolio_value ?? 0),
      lastError: null
    });

    return {
      configured: true,
      requestId,
      connection
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker sync failed.";
    const connection = await updateConnection({
      status: "Error",
      lastError: message
    });
    return { configured: true, connection, error: message };
  }
}

function buildAlpacaOrderBody(input: OrderInput) {
  const body: Record<string, unknown> = {
    symbol: input.ticker.toUpperCase(),
    qty: String(input.quantity),
    side: input.side,
    type: input.orderType ?? "market",
    time_in_force: input.timeInForce ?? "day"
  };

  if (input.limitPrice && body.type === "limit") {
    body.limit_price = input.limitPrice.toFixed(2);
  }

  if (input.stopPrice && input.takeProfitPrice && input.side === "buy") {
    body.order_class = "bracket";
    body.take_profit = { limit_price: input.takeProfitPrice.toFixed(2) };
    body.stop_loss = { stop_price: input.stopPrice.toFixed(2) };
  }

  return body;
}

export async function submitBrokerOrder(input: OrderInput) {
  const config = getBrokerConfig();
  const requestBody = buildAlpacaOrderBody(input);

  if (config.environment === "live") {
    await blockRealTradingAttempt({
      provider: config.provider,
      ticker: input.ticker,
      source: input.source,
      requestedOrder: requestBody
    });

    return prisma.brokerOrder.create({
      data: {
        provider: config.provider,
        environment: config.environment,
        ticker: input.ticker.toUpperCase(),
        side: input.side,
        orderType: input.orderType ?? "market",
        timeInForce: input.timeInForce ?? "day",
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        stopPrice: input.stopPrice,
        takeProfitPrice: input.takeProfitPrice,
        status: "Blocked",
        source: input.source,
        tradePlanId: input.tradePlanId,
        paperTradeId: input.paperTradeId,
        requestJson: JSON.stringify(requestBody),
        error: "Live real-money broker execution is disabled by server-side guardrails.",
        realMoneyBlocked: true
      }
    });
  }

  if (!config.configured) {
    return prisma.brokerOrder.create({
      data: {
        provider: config.provider,
        environment: config.environment,
        ticker: input.ticker.toUpperCase(),
        side: input.side,
        orderType: input.orderType ?? "market",
        timeInForce: input.timeInForce ?? "day",
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        stopPrice: input.stopPrice,
        takeProfitPrice: input.takeProfitPrice,
        status: "Blocked",
        source: input.source,
        tradePlanId: input.tradePlanId,
        paperTradeId: input.paperTradeId,
        requestJson: JSON.stringify(requestBody),
        error: "Alpaca paper credentials are missing.",
        realMoneyBlocked: false
      }
    });
  }

  try {
    const { data, requestId } = await alpacaRequest<Record<string, unknown>>("/v2/orders", {
      method: "POST",
      body: requestBody
    });

    const order = await prisma.brokerOrder.create({
      data: {
        provider: config.provider,
        environment: config.environment,
        brokerOrderId: String(data.id ?? ""),
        ticker: input.ticker.toUpperCase(),
        side: input.side,
        orderType: input.orderType ?? "market",
        timeInForce: input.timeInForce ?? "day",
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        stopPrice: input.stopPrice,
        takeProfitPrice: input.takeProfitPrice,
        status: String(data.status ?? "submitted"),
        source: input.source,
        tradePlanId: input.tradePlanId,
        paperTradeId: input.paperTradeId,
        requestJson: JSON.stringify(requestBody),
        responseJson: JSON.stringify({ ...data, requestId }),
        submittedAt: new Date()
      }
    });

    await createAlert({
      ticker: order.ticker,
      alertType: "broker paper order submitted",
      severity: "Info",
      message: `${order.ticker} order submitted to Alpaca paper trading. No real-money order was sent.`
    });

    return order;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker order failed.";
    await createAlert({
      ticker: input.ticker.toUpperCase(),
      alertType: "broker order failed",
      severity: "Warning",
      message
    });

    return prisma.brokerOrder.create({
      data: {
        provider: config.provider,
        environment: config.environment,
        ticker: input.ticker.toUpperCase(),
        side: input.side,
        orderType: input.orderType ?? "market",
        timeInForce: input.timeInForce ?? "day",
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        stopPrice: input.stopPrice,
        takeProfitPrice: input.takeProfitPrice,
        status: "Error",
        source: input.source,
        tradePlanId: input.tradePlanId,
        paperTradeId: input.paperTradeId,
        requestJson: JSON.stringify(requestBody),
        error: message
      }
    });
  }
}

export async function submitBrokerOrderFromTradePlan(tradePlanId: string) {
  const plan = await prisma.tradePlan.findUnique({ where: { id: tradePlanId } });
  if (!plan) {
    throw new Error("Trade plan not found.");
  }

  if (plan.status === "Watchlist Only" || plan.quantity < 1) {
    throw new Error("Only eligible demo trade plans can be submitted to broker paper trading.");
  }

  return submitBrokerOrder({
    ticker: plan.ticker,
    side: "buy",
    quantity: plan.quantity,
    orderType: "market",
    timeInForce: "day",
    stopPrice: plan.stopLoss,
    takeProfitPrice: plan.takeProfit,
    source: "trade-plan-paper-broker",
    tradePlanId: plan.id
  });
}

export async function getBrokerOrders() {
  return prisma.brokerOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });
}
