import type { NewsSentiment } from "./newsTypes.js";

export function scoreNewsImpact(input: { title: string; summary: string; dailyChangePercent: number }) {
  const text = `${input.title} ${input.summary}`.toLowerCase();
  const negative = ["lawsuit", "hack", "downgrade", "delisting", "security issue", "regulation"].some((word) => text.includes(word));
  const positive = ["upgrade", "earnings", "contract", "launch", "inflows", "demand", "breakout"].some((word) => text.includes(word));
  const sentiment: NewsSentiment = negative ? "bearish" : positive || input.dailyChangePercent > 1 ? "bullish" : "neutral";
  const magnitude = Math.min(12, Math.max(2, Math.abs(input.dailyChangePercent) * 1.5 + (positive || negative ? 4 : 1)));
  const scoreImpact = sentiment === "bearish" ? -Math.round(magnitude) : sentiment === "bullish" ? Math.round(magnitude) : 0;
  const impactLevel = Math.abs(scoreImpact) >= 10 ? "high" : Math.abs(scoreImpact) >= 5 ? "medium" : "low";
  return { sentiment, scoreImpact, impactLevel: impactLevel as "low" | "medium" | "high" };
}
