const LIVE_ALPACA_HOSTS = ["https://api.alpaca.markets", "https://api.alpaca.markets/v2"];

function normalized(value?: string | null) {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

export function validateStartupSafety() {
  const tradingMode = normalized(process.env.TRADING_MODE || "paper");
  const alpacaEnvironment = normalized(process.env.ALPACA_TRADING_ENV || "paper");
  const alpacaBaseUrl = normalized(process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets/v2");
  const liveAllowed = normalized(process.env.ALLOW_LIVE_BROKER_TRADING || "false") === "true";

  const violations: string[] = [];
  if (tradingMode !== "paper") violations.push("TRADING_MODE must be paper.");
  if (alpacaEnvironment !== "paper") violations.push("ALPACA_TRADING_ENV must be paper.");
  if (liveAllowed) violations.push("ALLOW_LIVE_BROKER_TRADING must remain false.");
  if (LIVE_ALPACA_HOSTS.some((host) => alpacaBaseUrl === host || alpacaBaseUrl.startsWith(`${host}/`))) {
    violations.push("ALPACA_TRADING_BASE_URL points to a live Alpaca endpoint.");
  }

  if (violations.length) {
    throw new Error(`Unsafe trading configuration rejected at startup: ${violations.join(" ")}`);
  }
}

export function assertPaperTradingOnly(source = "broker order") {
  const tradingMode = normalized(process.env.TRADING_MODE || "paper");
  const alpacaEnvironment = normalized(process.env.ALPACA_TRADING_ENV || "paper");
  if (tradingMode !== "paper" || alpacaEnvironment !== "paper") {
    throw new Error(`${source} blocked: TradePilot only supports paper trading.`);
  }
}
