import { marketDataProvider } from "../marketDataProvider.js";
import { classifyMarketRegime } from "./macroBriefing.js";

export async function buildCryptoMarketBriefing() {
  const universe = await marketDataProvider.getMarketUniverse("crypto");
  const regime = classifyMarketRegime(universe);
  const btc = universe.find((asset) => asset.ticker === "BTC");
  const eth = universe.find((asset) => asset.ticker === "ETH");
  const sortedByMove = [...universe].sort((left, right) => right.dailyChangePercent - left.dailyChangePercent);
  const sortedByVolatility = [...universe].sort((left, right) => Math.abs(right.dailyChangePercent) - Math.abs(left.dailyChangePercent));
  const narratives = new Map<string, number>();

  for (const asset of universe) {
    const current = narratives.get(asset.industry) ?? 0;
    narratives.set(asset.industry, current + asset.dailyChangePercent);
  }

  const strongestNarratives = [...narratives.entries()]
    .map(([name, move]) => ({ name, score: Number(move.toFixed(2)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const memePump = universe.find((asset) => asset.industry.toLowerCase().includes("meme") && asset.dailyChangePercent > 10);

  return {
    assetType: "crypto" as const,
    generatedAt: new Date().toISOString(),
    marketMood: regime.mood,
    marketRegime: regime.regime,
    btcTrend: (btc?.dailyChangePercent ?? 0) > 1 ? "bullish" : (btc?.dailyChangePercent ?? 0) < -1 ? "bearish" : "neutral",
    ethTrend: (eth?.dailyChangePercent ?? 0) > 1 ? "bullish" : (eth?.dailyChangePercent ?? 0) < -1 ? "bearish" : "neutral",
    cryptoRiskState: regime.regime === "bullish" ? "risk-on" : regime.regime === "risk-off" || regime.regime === "bearish" ? "risk-off" : "mixed",
    strongestCryptoNarratives: strongestNarratives,
    highVolatilityAssets: sortedByVolatility.slice(0, 5).map((asset) => ({
      ticker: asset.ticker,
      move: asset.dailyChangePercent,
      industry: asset.industry
    })),
    topGainers: sortedByMove.slice(0, 5).map((asset) => ({ ticker: asset.ticker, move: asset.dailyChangePercent, price: asset.price })),
    topLosers: sortedByMove.slice(-5).reverse().map((asset) => ({ ticker: asset.ticker, move: asset.dailyChangePercent, price: asset.price })),
    memeCoinPumpWarning: memePump ? `${memePump.ticker} shows meme-coin pump risk. Paper-only review, no leverage.` : null,
    noLeverageWarning: "No leverage, futures, margin, withdrawals, or real crypto execution are allowed.",
    risksToday: [
      ...(regime.warning ? [regime.warning] : []),
      "Crypto volatility can invalidate paper setups quickly.",
      "Avoid meme-coin pumps unless the setup remains paper-only and fully risk-blocked."
    ],
    noTradeWarning: regime.regime === "risk-off" ? "NO TRADE TODAY if BTC/ETH trend remains bearish or timeframes conflict." : null,
    bestOpportunities: sortedByMove.filter((asset) => asset.ticker !== "DOGE").slice(0, 3).map((asset) => asset.ticker)
  };
}
