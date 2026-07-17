import type { MockStock } from "../../data/mockStocks.js";
import { prisma } from "../../utils/prisma.js";
import type { AssetType } from "../marketDataProvider.js";
import { professionalExecutionConfigFromEnv, simulateProfessionalFill, type ExecutionSide } from "./executionSimulator.js";

export async function simulateAndRecordExecution(input: {
  paperTradeId?: string;
  assetType: AssetType;
  ticker: string;
  side: ExecutionSide;
  referencePrice: number;
  quantity: number;
  stock: MockStock;
  seed?: string;
}) {
  const simulation = simulateProfessionalFill({
    side: input.side,
    referencePrice: input.referencePrice,
    quantity: input.quantity,
    asset: input.stock,
    ...professionalExecutionConfigFromEnv(),
    seed: input.seed
  });

  const record = await prisma.executionSimulation.create({
    data: {
      paperTradeId: input.paperTradeId,
      assetType: input.assetType,
      ticker: input.ticker,
      side: input.side,
      requestedPrice: simulation.requestedPrice,
      requestedQuantity: simulation.requestedQuantity,
      filledQuantity: simulation.filledQuantity,
      partialFill: simulation.partialFill,
      fillPrice: simulation.fillPrice,
      estimatedBid: simulation.estimatedBid,
      estimatedAsk: simulation.estimatedAsk,
      spreadBps: simulation.spreadBps,
      slippageBps: simulation.slippageBps,
      totalExecutionBps: simulation.totalExecutionBps,
      slippageAmount: simulation.slippageAmount,
      fee: simulation.fee,
      latencyMs: simulation.latencyMs,
      participationRate: simulation.participationRate,
      qualityGrade: simulation.qualityGrade,
      modelVersion: simulation.modelVersion,
      warningsJson: JSON.stringify(simulation.warnings)
    }
  });

  return { simulation, record };
}

export async function getExecutionSimulationSummary(take = 100, assetType?: AssetType) {
  const records = await prisma.executionSimulation.findMany({
    where: assetType ? { assetType } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(500, take))
  });
  const count = records.length;
  const averageSlippageBps = count ? records.reduce((sum, item) => sum + item.slippageBps, 0) / count : 0;
  const averageTotalBps = count ? records.reduce((sum, item) => sum + item.totalExecutionBps, 0) / count : 0;
  const totalFees = records.reduce((sum, item) => sum + item.fee, 0);
  const partialFillRate = count ? (records.filter((item) => item.partialFill).length / count) * 100 : 0;
  return {
    count,
    averageSlippageBps: Number(averageSlippageBps.toFixed(2)),
    averageTotalBps: Number(averageTotalBps.toFixed(2)),
    totalFees: Number(totalFees.toFixed(2)),
    partialFillRate: Number(partialFillRate.toFixed(2)),
    recent: records
  };
}
