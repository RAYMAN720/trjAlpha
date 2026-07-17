import { prisma } from "../../utils/prisma.js";
import { marketDataProvider, marketForAssetType, type AssetType } from "../marketDataProvider.js";
import { classifyProfessionalMarketRegime, type MarketRegimeAssessment } from "./marketRegimeCore.js";

export async function getCurrentProfessionalMarketRegime(
  assetType: AssetType = "stock",
  options: { persist?: boolean } = {}
): Promise<MarketRegimeAssessment> {
  const market = marketForAssetType(assetType);
  const benchmarkTicker = assetType === "stock" ? "SPY" : "BTC";
  const [universe, benchmarkHistory] = await Promise.all([
    marketDataProvider.getMarketUniverse(market),
    marketDataProvider.getChart(benchmarkTicker, market, "daily").catch(() => [])
  ]);

  const assessment = classifyProfessionalMarketRegime({ universe, benchmarkHistory });
  if (options.persist) {
    await prisma.marketRegimeSnapshot.create({
      data: {
        assetType,
        regime: assessment.regime,
        longScore: assessment.longScore,
        confidence: assessment.confidence,
        allowLongBreakouts: assessment.allowLongBreakouts,
        positionSizeMultiplier: assessment.positionSizeMultiplier,
        metricsJson: JSON.stringify(assessment.metrics),
        warningsJson: JSON.stringify(assessment.warnings),
        summary: assessment.summary
      }
    });
  }
  return assessment;
}

export async function getRecentMarketRegimes(assetType?: AssetType, take = 40) {
  return prisma.marketRegimeSnapshot.findMany({
    where: assetType ? { assetType } : undefined,
    orderBy: { capturedAt: "desc" },
    take: Math.max(1, Math.min(200, take))
  });
}
