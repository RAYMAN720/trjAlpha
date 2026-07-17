import type { AssetType } from "../marketDataProvider.js";

export function detectCatalystType(assetType: AssetType, text: string) {
  const value = text.toLowerCase();
  if (assetType === "crypto") {
    if (value.includes("etf")) return "ETF news";
    if (value.includes("listing")) return "exchange listing";
    if (value.includes("unlock")) return "token unlock";
    if (value.includes("hack") || value.includes("security")) return "hack/security issue";
    if (value.includes("network") || value.includes("upgrade")) return "network upgrade";
    if (value.includes("btc") || value.includes("bitcoin")) return "BTC-led move";
    return "sector narrative";
  }
  if (value.includes("earnings")) return "earnings";
  if (value.includes("upgrade")) return "analyst upgrade";
  if (value.includes("downgrade")) return "analyst downgrade";
  if (value.includes("lawsuit")) return "lawsuit";
  if (value.includes("regulation")) return "regulation";
  if (value.includes("contract")) return "contract";
  if (value.includes("acquisition")) return "acquisition";
  if (value.includes("launch")) return "product launch";
  if (value.includes("sec") || value.includes("filing")) return "SEC filing";
  return "sector rotation";
}
