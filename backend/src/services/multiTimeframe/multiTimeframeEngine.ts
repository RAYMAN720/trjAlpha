import { marketDataProvider, marketForAssetType, type AssetType, type MarketChartPoint, type MarketMode } from "../marketDataProvider.js";
import {
  analyzeMultiTimeframeWithPython,
  type PythonCandle,
  type PythonMultiTimeframeResponse,
  type PythonTechnicalAnalysis
} from "../pythonEngineClient.js";
import { alignTimeframes } from "./timeframeAlignment.js";
import { analyzeTimeframeCandles, type TimeframeAnalysis, type TimeframeName } from "./timeframeAnalyzer.js";

export type MultiTimeframeResult = ReturnType<typeof alignTimeframes> & {
  assetType: AssetType;
  ticker: string;
  timeframes: TimeframeAnalysis[];
  engine?: "python" | "typescript";
  pythonWarning?: string | null;
};

function chartToCandles(chart: MarketChartPoint[]): PythonCandle[] {
  return chart.map((point) => ({
    time: point.date,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume
  }));
}

function toSetupStatus(analysis: PythonTechnicalAnalysis): TimeframeAnalysis["setupStatus"] {
  if (analysis.trend === "bullish" && analysis.volumeConfirmation) return "breakout";
  if (analysis.trend === "bearish") return "breakdown";
  if (analysis.rsi < 45) return "pullback";
  return "range";
}

function pythonFrameToTimeframe(frame: string): TimeframeName {
  return frame === "1d" || frame === "daily" ? "daily" : frame === "4h" ? "4h" : frame === "1h" ? "1h" : frame === "15m" ? "15m" : "5m";
}

function mapPythonResult(ticker: string, assetType: AssetType, frames: TimeframeName[], python: PythonMultiTimeframeResponse): MultiTimeframeResult {
  const timeframes = frames.map((frame) => {
    const analysis = python.timeframes[frame] ?? python.timeframes[frame === "daily" ? "1d" : frame] ?? Object.entries(python.timeframes).find(([key]) => pythonFrameToTimeframe(key) === frame)?.[1];
    if (!analysis) return analyzeTimeframeCandles([], frame);
    return {
      timeframe: frame,
      trend: analysis.trend,
      rsi: Math.round(analysis.rsi),
      movingAveragePosition: analysis.trend === "bullish" ? "above" : analysis.trend === "bearish" ? "below" : "mixed",
      volumeConfirmation: analysis.volumeConfirmation,
      support: analysis.support,
      resistance: analysis.resistance,
      setupStatus: toSetupStatus(analysis),
      score: Math.round(analysis.technicalScore)
    } satisfies TimeframeAnalysis;
  });

  return {
    assetType,
    ticker,
    shortTerm: python.shortTermTrend,
    mediumTerm: python.mediumTermTrend,
    dailyTrend: python.dailyTrend,
    alignment: python.alignment,
    score: Math.round(python.score),
    warning: python.warning,
    pythonWarning: python.warning,
    engine: "python",
    timeframes
  };
}

export async function analyzeMultiTimeframe(ticker: string, marketOrAsset: MarketMode | AssetType = "stocks"): Promise<MultiTimeframeResult> {
  const market: MarketMode = marketOrAsset === "crypto" ? "crypto" : marketOrAsset === "stock" ? "stocks" : marketOrAsset;
  const assetType: AssetType = market === "crypto" ? "crypto" : "stock";
  const stock = await marketDataProvider.getStock(ticker, marketForAssetType(assetType));
  if (!stock) throw new Error("Asset not found.");

  const frames: TimeframeName[] = market === "crypto" ? ["15m", "1h", "4h", "daily"] : ["5m", "15m", "1h", "daily"];
  const charts = await Promise.all(frames.map((frame) => marketDataProvider.getChart(stock.ticker, market, frame)));
  const enoughRealData = charts.every((chart) => chart.length >= 20);

  if (enoughRealData) {
    const pythonResult = await analyzeMultiTimeframeWithPython({
      symbol: stock.ticker,
      assetType,
      timeframes: Object.fromEntries(frames.map((frame, index) => [frame, chartToCandles(charts[index])]))
    });
    if (pythonResult) return mapPythonResult(stock.ticker, assetType, frames, pythonResult);
  }

  const timeframes = frames.map((frame, index) => analyzeTimeframeCandles(charts[index], frame));
  const alignment = alignTimeframes(timeframes);
  const missingFrames = frames.filter((_, index) => charts[index].length < 20);
  const missingWarning = missingFrames.length
    ? `Real candle data unavailable or insufficient for: ${missingFrames.join(", ")}. Trading must remain blocked until data recovers.`
    : null;

  return {
    assetType,
    ticker: stock.ticker,
    engine: "typescript",
    ...alignment,
    score: missingFrames.length ? 0 : alignment.score,
    alignment: missingFrames.length ? "conflicting" : alignment.alignment,
    warning: missingWarning ?? alignment.warning,
    pythonWarning: missingWarning,
    timeframes
  };
}
