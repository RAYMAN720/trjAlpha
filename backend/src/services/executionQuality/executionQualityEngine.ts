import type { MockStock } from "../../data/mockStocks.js";
import { marketDataProvider, marketForAssetType, type AssetType } from "../marketDataProvider.js";
import { detectChaseRisk } from "./chaseRiskDetector.js";
import { scoreEntryQuality } from "./entryQualityScorer.js";
import { checkSpreadLiquidity } from "./spreadLiquidityChecker.js";

export type ExecutionQualityResult = {
  executionGrade: "A+" | "A" | "B" | "C" | "D" | "F";
  entryQuality: number;
  chaseRisk: "low" | "medium" | "high";
  spreadRisk: "low" | "medium" | "high";
  warnings: string[];
  blocked: boolean;
};

export async function evaluateExecutionQuality(input: {
  assetType: AssetType;
  ticker: string;
  score: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<ExecutionQualityResult> {
  const stock = await marketDataProvider.getStock(input.ticker, marketForAssetType(input.assetType));
  if (!stock) throw new Error("Asset not found.");
  return evaluateExecutionQualityForStock({ ...input, stock });
}

export function evaluateExecutionQualityForStock(input: {
  assetType: AssetType;
  stock: MockStock;
  score: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}): ExecutionQualityResult {
  const entry = input.entryPrice ?? input.stock.price;
  const stop = input.stopLoss ?? entry * 0.95;
  const target = input.takeProfit ?? entry + (entry - stop) * 2;
  const riskRewardRatio = (target - entry) / Math.max(0.000001, entry - stop);
  const chase = detectChaseRisk(input.stock, input.assetType);
  const liquidity = checkSpreadLiquidity(input.stock, input.assetType);
  const nearResistance = input.stock.dailyChangePercent > 15;
  const volatilityTooHigh = Math.abs(input.stock.dailyChangePercent) > (input.assetType === "crypto" ? 20 : 22);
  const scored = scoreEntryQuality({
    baseScore: input.score,
    chasePenalty: chase.penalty,
    liquidityScore: liquidity.liquidityScore,
    riskRewardRatio,
    nearResistance,
    volatilityTooHigh
  });
  const warnings = [
    chase.warning,
    liquidity.warning,
    nearResistance ? "Price is close to likely resistance after a large move." : null,
    volatilityTooHigh ? "Volatility is too high for automatic paper trading." : null,
    riskRewardRatio < 2 ? "Risk/reward is below 2:1." : null
  ].filter(Boolean) as string[];
  const blocked = scored.executionGrade === "F" || chase.chaseRisk === "high" || liquidity.spreadRisk === "high" || riskRewardRatio < 2;

  return {
    executionGrade: scored.executionGrade,
    entryQuality: scored.entryQuality,
    chaseRisk: chase.chaseRisk,
    spreadRisk: liquidity.spreadRisk,
    warnings,
    blocked
  };
}
