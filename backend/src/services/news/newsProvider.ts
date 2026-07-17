import type { MarketMode } from "../marketDataProvider.js";
import type { MarketNewsItem } from "./newsTypes.js";

export interface NewsProvider {
  name: string;
  getLatest(market?: MarketMode, symbol?: string): Promise<MarketNewsItem[]>;
}

export function configuredNewsProviderName() {
  return (process.env.NEWS_PROVIDER || "rss").toLowerCase();
}
