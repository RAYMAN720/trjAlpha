import type { MarketNewsItem, NewsDecision } from "./newsTypes.js";

export function decideFromNews(item: Pick<MarketNewsItem, "sentiment" | "scoreImpact" | "impactLevel">): NewsDecision {
  if (item.sentiment === "bearish" && item.impactLevel !== "low") return "BLOCKED_BY_RISK";
  if (item.scoreImpact >= 10) return "PAPER_TRADE_CANDIDATE";
  if (item.scoreImpact >= 6) return "STRONG_WATCH";
  if (item.scoreImpact > 0) return "WATCH";
  return "NO_ACTION";
}
