import type { MockStock } from "../../data/mockStocks.js";

export function classifyMarketRegime(universe: MockStock[]) {
  const averageMove = universe.length ? universe.reduce((total, item) => total + item.dailyChangePercent, 0) / universe.length : 0;
  const highVolatility = universe.filter((item) => Math.abs(item.dailyChangePercent) >= 10).length;
  const losers = universe.filter((item) => item.dailyChangePercent < -3).length;
  const gainers = universe.filter((item) => item.dailyChangePercent > 3).length;

  if (losers > universe.length * 0.45 || averageMove < -3) {
    return {
      regime: "risk-off" as const,
      mood: "Dangerous",
      score: 30,
      warning: "Market regime is risk-off. No trade is a valid professional decision."
    };
  }

  if (highVolatility > universe.length * 0.35) {
    return {
      regime: "high volatility" as const,
      mood: "Volatile",
      score: 45,
      warning: "Unusual volatility is elevated. Reduce size and require stronger confirmation."
    };
  }

  if (averageMove > 2 && gainers > losers) {
    return {
      regime: "bullish" as const,
      mood: "Constructive",
      score: 75,
      warning: null
    };
  }

  if (averageMove < -1.5) {
    return {
      regime: "bearish" as const,
      mood: "Defensive",
      score: 45,
      warning: "Market trend is bearish. Strong setups need higher scores and tighter risk."
    };
  }

  return {
    regime: "neutral" as const,
    mood: "Neutral",
    score: 60,
    warning: null
  };
}
