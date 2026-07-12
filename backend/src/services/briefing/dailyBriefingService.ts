import { buildCryptoMarketBriefing } from "./cryptoMarketBriefing.js";
import { buildStockMarketBriefing } from "./stockMarketBriefing.js";

export async function getDailyBriefing() {
  const [stocks, crypto] = await Promise.all([buildStockMarketBriefing(), buildCryptoMarketBriefing()]);
  const riskWarnings = [...stocks.risksToday, ...crypto.risksToday].slice(0, 6);
  const noTradeWarnings = [stocks.noTradeWarning, crypto.noTradeWarning].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    marketMood: stocks.marketRegime === "risk-off" || crypto.marketRegime === "risk-off" ? "Defensive" : "Prepared",
    stocks,
    crypto,
    bestOpportunities: {
      stocks: stocks.bestOpportunities,
      crypto: crypto.bestOpportunities
    },
    risksToday: riskWarnings,
    noTradeWarning: noTradeWarnings.length ? noTradeWarnings.join(" ") : null,
    safety: [
      "This is a research and paper-trading system, not financial advice.",
      "Real trading, leverage, margin, and futures remain disabled.",
      "No trade is a valid professional decision."
    ]
  };
}

export { buildStockMarketBriefing, buildCryptoMarketBriefing };
