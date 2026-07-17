import type { MockStock } from "../../data/mockStocks.js";
import type { AssetType } from "../marketDataProvider.js";

export function detectChaseRisk(stock: MockStock, assetType: AssetType) {
  const move = stock.dailyChangePercent;
  const highThreshold = assetType === "crypto" ? 18 : 20;
  const mediumThreshold = assetType === "crypto" ? 10 : 12;

  if (move >= highThreshold) {
    return {
      chaseRisk: "high" as const,
      penalty: 35,
      warning: `Possible FOMO trade: asset already moved +${move.toFixed(2)}%.`
    };
  }

  if (move >= mediumThreshold) {
    return {
      chaseRisk: "medium" as const,
      penalty: 15,
      warning: `Entry may be late after a +${move.toFixed(2)}% move.`
    };
  }

  return {
    chaseRisk: "low" as const,
    penalty: 0,
    warning: null
  };
}
