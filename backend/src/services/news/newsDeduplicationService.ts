import type { MarketNewsItem } from "./newsTypes.js";

export function dedupeNews(items: MarketNewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.assetType}:${item.symbol}:${item.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
