import { marketDataProvider } from "../marketDataProvider.js";
import { buildSectorBriefing } from "./sectorBriefing.js";
import { classifyMarketRegime } from "./macroBriefing.js";

export async function buildStockMarketBriefing() {
  const universe = await marketDataProvider.getMarketUniverse("stocks");
  const regime = classifyMarketRegime(universe);
  const sectors = buildSectorBriefing(universe);
  const sortedByMove = [...universe].sort((left, right) => right.dailyChangePercent - left.dailyChangePercent);
  const sortedByVolume = [...universe].sort((left, right) => right.volume / Math.max(1, right.avgVolume) - left.volume / Math.max(1, left.avgVolume));
  const spyTrend = regime.regime === "bullish" ? "positive" : regime.regime === "risk-off" || regime.regime === "bearish" ? "negative" : "mixed";
  const qqqTrend = sectors.strongestSectors.some((sector) => sector.sector === "Technology") ? "positive" : spyTrend;

  return {
    assetType: "stock" as const,
    generatedAt: new Date().toISOString(),
    marketMood: regime.mood,
    marketRegime: regime.regime,
    spyTrend,
    qqqTrend,
    strongestSectors: sectors.strongestSectors,
    weakestSectors: sectors.weakestSectors,
    unusualMarketVolatility: regime.regime === "high volatility",
    topGainers: sortedByMove.slice(0, 5).map((stock) => ({ ticker: stock.ticker, move: stock.dailyChangePercent, price: stock.price })),
    topLosers: sortedByMove.slice(-5).reverse().map((stock) => ({ ticker: stock.ticker, move: stock.dailyChangePercent, price: stock.price })),
    highVolumeNames: sortedByVolume.slice(0, 5).map((stock) => ({
      ticker: stock.ticker,
      relativeVolume: Number((stock.volume / Math.max(1, stock.avgVolume)).toFixed(2)),
      move: stock.dailyChangePercent
    })),
    earningsCatalystPlaceholder: "Earnings and catalyst feed not connected yet. Treat catalyst checks as supplied-data only.",
    risksToday: [
      ...(regime.warning ? [regime.warning] : []),
      "Real trading is disabled. Paper trading only.",
      "Avoid forcing trades without playbook and timeframe confirmation."
    ],
    noTradeWarning: regime.regime === "risk-off" ? "NO TRADE TODAY unless a top-quality setup passes every risk rule." : null,
    bestOpportunities: sortedByVolume.slice(0, 3).map((stock) => stock.ticker)
  };
}
