import { normalizeMarketMode, type MarketMode } from "../marketDataProvider.js";
import { analyzeNewsWithOptionalAi } from "./newsAiAnalyzer.js";
import { dedupeNews } from "./newsDeduplicationService.js";
import { finnhubNewsProvider } from "./finnhubNewsProvider.js";
import { polygonNewsProvider } from "./polygonNewsProvider.js";
import { cryptoNewsProvider } from "./cryptoNewsProvider.js";
import { rssNewsProvider } from "./rssNewsProvider.js";
import { secEdgarNewsProvider } from "./secEdgarNewsProvider.js";
import { sortByRelevance } from "./newsRelevanceService.js";
import { configuredNewsProviderName, type NewsProvider } from "./newsProvider.js";
import type { NewsScanResult } from "./newsTypes.js";

function providerFor(market: MarketMode): NewsProvider {
  if (market === "crypto") return cryptoNewsProvider;
  const configured = configuredNewsProviderName();
  if (configured === "polygon") return polygonNewsProvider;
  if (configured === "sec" || configured === "edgar") return secEdgarNewsProvider;
  if (configured === "rss") return rssNewsProvider;
  return finnhubNewsProvider;
}

export async function collectLatestNews(input: { market?: unknown; symbol?: string; limit?: number } = {}): Promise<NewsScanResult> {
  const market = normalizeMarketMode(input.market);
  const provider = providerFor(market);
  const raw = await provider.getLatest(market, input.symbol);
  const deduped = dedupeNews(raw);
  const analyzed = await Promise.all(sortByRelevance(deduped).slice(0, input.limit ?? 50).map(analyzeNewsWithOptionalAi));
  return {
    provider: provider.name,
    status: provider.name.includes("fallback") ? "fallback" : "ok",
    scannedAt: new Date().toISOString(),
    count: analyzed.length,
    items: analyzed,
    warning: provider.name.includes("fallback")
      ? "News provider unavailable or not configured. Using fallback market-catalyst scan; do not use for real-money decisions."
      : undefined
  };
}

export async function getNewsStatus() {
  const provider = configuredNewsProviderName();
  return {
    provider,
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
    polygonConfigured: Boolean(process.env.POLYGON_API_KEY),
    aiAnalysisEnabled: String(process.env.NEWS_AI_ANALYSIS_ENABLED ?? "true") !== "false",
    refreshIntervalMinutes: Number(process.env.NEWS_REFRESH_INTERVAL_MINUTES ?? 15),
    maxArticlesPerScan: Number(process.env.NEWS_MAX_ARTICLES_PER_SCAN ?? 50),
    paperOnly: true,
    warning: "News must never create a trade alone. Technical, volume, playbook, and risk checks still apply."
  };
}
