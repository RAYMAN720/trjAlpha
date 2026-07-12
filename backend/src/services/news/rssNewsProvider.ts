import { marketDataProvider, type MarketMode } from "../marketDataProvider.js";
import { detectCatalystType } from "./newsCatalystDetector.js";
import { decideFromNews } from "./newsDecisionEngine.js";
import { scoreNewsImpact } from "./newsImpactScoringService.js";
import type { NewsProvider } from "./newsProvider.js";
import type { MarketNewsItem } from "./newsTypes.js";

function sourceUrl(symbol: string) {
  return `https://news.google.com/search?q=${encodeURIComponent(symbol + " market news")}`;
}

export class RssNewsProvider implements NewsProvider {
  name = "rss-fallback";

  async getLatest(market: MarketMode = "stocks", symbol?: string): Promise<MarketNewsItem[]> {
    const universe = await marketDataProvider.getMarketUniverse(market);
    const selected = symbol ? universe.filter((item) => item.ticker.toUpperCase() === symbol.toUpperCase()) : universe.slice(0, 18);
    const assetType = market === "crypto" ? "crypto" : "stock";
    return selected.map((asset, index) => {
      const title = `${asset.ticker}: ${asset.newsCatalyst}`;
      const impact = scoreNewsImpact({ title, summary: asset.newsCatalyst, dailyChangePercent: asset.dailyChangePercent });
      const catalystType = detectCatalystType(assetType, title);
      return {
        id: `${assetType}-${asset.ticker}-${index}`,
        assetType,
        ticker: asset.ticker,
        symbol: asset.ticker,
        title,
        source: "TradePilot fallback news scan",
        url: sourceUrl(asset.ticker),
        publishedAt: new Date(Date.now() - index * 22 * 60_000).toISOString(),
        summary: asset.newsCatalyst,
        sentiment: impact.sentiment,
        impactLevel: impact.impactLevel,
        catalystType,
        timeSensitivity: Math.abs(impact.scoreImpact) >= 8 ? "high" : "medium",
        bullishInterpretation: `${asset.ticker} can stay on watch if price, volume, and playbook rules confirm the catalyst.`,
        bearishInterpretation: `${asset.ticker} should be blocked if the catalyst fades or risk/reward weakens.`,
        riskWarning: "News is not enough for a trade. Require technical confirmation and risk-engine approval.",
        scoreImpact: impact.scoreImpact,
        decision: decideFromNews({ sentiment: impact.sentiment, scoreImpact: impact.scoreImpact, impactLevel: impact.impactLevel }),
        confidence: Math.min(86, Math.max(45, 58 + Math.abs(impact.scoreImpact) * 2)),
        dataQuality: "FALLBACK MODE"
      };
    });
  }
}

export const rssNewsProvider = new RssNewsProvider();
