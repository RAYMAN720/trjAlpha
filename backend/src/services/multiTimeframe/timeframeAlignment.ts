import type { TimeframeAnalysis } from "./timeframeAnalyzer.js";

export function alignTimeframes(analyses: TimeframeAnalysis[]) {
  const bullish = analyses.filter((item) => item.trend === "bullish").length;
  const bearish = analyses.filter((item) => item.trend === "bearish").length;
  const daily = analyses.find((item) => item.timeframe === "daily");
  const score = Math.round(analyses.reduce((total, item) => total + item.score, 0) / Math.max(1, analyses.length));
  const alignment =
    bullish === analyses.length || bearish === analyses.length
      ? "aligned"
      : bullish > 0 && bearish > 0
        ? "conflicting"
        : "mixed";
  const shortTerm = analyses[0]?.trend ?? "neutral";
  const mediumTerm = analyses[Math.min(analyses.length - 1, 2)]?.trend ?? "neutral";
  const dailyTrend = daily?.trend ?? "neutral";
  const warning =
    shortTerm === "bullish" && dailyTrend === "bearish"
      ? "Short-term bullish but daily trend bearish."
      : alignment === "conflicting"
        ? "Timeframes are conflicting; avoid strong paper-trade approval."
        : dailyTrend === "bearish"
          ? "Daily trend is bearish; confidence is reduced."
          : null;

  return {
    shortTerm,
    mediumTerm,
    dailyTrend,
    alignment,
    score: dailyTrend === "bearish" ? Math.max(0, score - 12) : alignment === "aligned" ? Math.min(100, score + 8) : score,
    warning
  };
}
