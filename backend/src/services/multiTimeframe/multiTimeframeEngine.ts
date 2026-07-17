import { marketDataProvider, marketForAssetType, type AssetType, type MarketMode } from "../marketDataProvider.js";
import { markTypeScriptAnalysisRun } from "../typeScriptAnalysisEngine.js";
import { alignTimeframes } from "./timeframeAlignment.js";
import { analyzeTimeframeCandles, type TimeframeAnalysis, type TimeframeName } from "./timeframeAnalyzer.js";

export type MultiTimeframeResult = ReturnType<typeof alignTimeframes> & {
  assetType: AssetType;
  ticker: string;
  timeframes: TimeframeAnalysis[];
  engine?: "typescript";
  analysisWarning?: string | null;
};

export async function analyzeMultiTimeframe(ticker: string, marketOrAsset: MarketMode | AssetType = "stocks"): Promise<MultiTimeframeResult> {
  const market: MarketMode = marketOrAsset === "crypto" ? "crypto" : marketOrAsset === "stock" ? "stocks" : marketOrAsset;
  const assetType: AssetType = market === "crypto" ? "crypto" : "stock";
  const stock = await marketDataProvider.getStock(ticker, marketForAssetType(assetType));
  if (!stock) throw new Error("Asset not found.");

  const frames: TimeframeName[] = market === "crypto" ? ["15m", "1h", "4h", "daily"] : ["5m", "15m", "1h", "daily"];
  const charts = await Promise.all(frames.map((frame) => marketDataProvider.getChart(stock.ticker, market, frame)));
  const timeframes = frames.map((frame, index) => analyzeTimeframeCandles(charts[index], frame));
  const alignment = alignTimeframes(timeframes);
  const missingFrames = frames.filter((_, index) => charts[index].length < 20);
  const missingWarning = missingFrames.length
    ? `Real candle data unavailable or insufficient for: ${missingFrames.join(", ")}. Trading must remain blocked until data recovers.`
    : null;
  markTypeScriptAnalysisRun();

  return {
    assetType,
    ticker: stock.ticker,
    engine: "typescript",
    ...alignment,
    score: missingFrames.length ? 0 : alignment.score,
    alignment: missingFrames.length ? "conflicting" : alignment.alignment,
    warning: missingWarning ?? alignment.warning,
    analysisWarning: missingWarning,
    timeframes
  };
}
