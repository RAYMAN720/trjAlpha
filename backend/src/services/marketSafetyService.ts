import type { MockStock } from "../data/mockStocks.js";
import { getUsEquityMarketClock } from "./marketClockService.js";
import type { AssetType } from "./marketDataProvider.js";

export type QuoteExecutionCheck = {
  executable: boolean;
  reason: string;
  ageMinutes: number | null;
};

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isFallbackQuote(asset: Pick<MockStock, "quoteSource">) {
  const source = String(asset.quoteSource ?? "").toLowerCase();
  return !source || source.includes("fallback") || source.includes("static") || source.includes("mock") || source.includes("simulation");
}

function trustedSource(assetType: AssetType, source: string) {
  const normalized = source.toLowerCase();
  if (assetType === "crypto") return normalized.includes("binance");
  return normalized.includes("alpaca") || normalized.includes("yahoo finance");
}

export function checkQuoteForExecution(
  asset: MockStock | null | undefined,
  assetType: AssetType,
  options: { now?: Date; requireOpenMarket?: boolean } = {}
): QuoteExecutionCheck {
  const now = options.now ?? new Date();
  if (!asset || !positiveNumber(asset.price)) {
    return { executable: false, reason: "No valid positive market price is available.", ageMinutes: null };
  }

  const source = String(asset.quoteSource ?? "");
  if (!trustedSource(assetType, source) || isFallbackQuote(asset)) {
    return { executable: false, reason: `Quote source is not executable: ${source || "unknown source"}.`, ageMinutes: null };
  }

  const updatedAt = asset.quoteUpdatedAt ? new Date(asset.quoteUpdatedAt) : null;
  const timestamp = updatedAt?.getTime();
  if (!timestamp || !Number.isFinite(timestamp)) {
    return { executable: false, reason: "Quote timestamp is missing or invalid.", ageMinutes: null };
  }

  const ageMinutes = Math.max(0, (now.getTime() - timestamp) / 60_000);
  const maxAgeMinutes = Number(
    assetType === "crypto"
      ? process.env.CRYPTO_EXECUTION_QUOTE_MAX_AGE_MINUTES ?? 3
      : process.env.STOCK_EXECUTION_QUOTE_MAX_AGE_MINUTES ?? 20
  );
  if (ageMinutes > maxAgeMinutes) {
    return { executable: false, reason: `Quote is stale (${ageMinutes.toFixed(1)} minutes old).`, ageMinutes };
  }

  if (assetType === "stock" && (options.requireOpenMarket ?? true)) {
    const clock = getUsEquityMarketClock(now);
    if (!clock.open) return { executable: false, reason: clock.reason, ageMinutes };
  }

  return { executable: true, reason: "Quote is fresh and comes from an approved live provider.", ageMinutes };
}
