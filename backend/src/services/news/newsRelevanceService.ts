import type { MarketNewsItem } from "./newsTypes.js";

export function sortByRelevance(items: MarketNewsItem[]) {
  return [...items].sort((left, right) => {
    const impact = Math.abs(right.scoreImpact) - Math.abs(left.scoreImpact);
    if (impact !== 0) return impact;
    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });
}
