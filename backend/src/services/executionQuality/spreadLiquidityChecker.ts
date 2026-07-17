import type { MockStock } from "../../data/mockStocks.js";
import type { AssetType } from "../marketDataProvider.js";

export function checkSpreadLiquidity(stock: MockStock, assetType: AssetType) {
  const relativeVolume = stock.volume / Math.max(1, stock.avgVolume);
  const minimumRelativeVolume = assetType === "crypto" ? 0.5 : 1.5;
  const minimumVolume = assetType === "crypto" ? 5_000_000 : 1_000_000;
  const spreadRisk: "low" | "medium" | "high" =
    stock.price < (assetType === "crypto" ? 0.01 : 5) || stock.volume < minimumVolume || relativeVolume < minimumRelativeVolume
      ? "high"
      : relativeVolume < minimumRelativeVolume * 1.2
        ? "medium"
        : "low";

  return {
    spreadRisk,
    liquidityScore: spreadRisk === "low" ? 90 : spreadRisk === "medium" ? 65 : 30,
    warning: spreadRisk === "high" ? "Spread/liquidity risk is high." : spreadRisk === "medium" ? "Liquidity is acceptable but not ideal." : null
  };
}
