import { prisma } from "../utils/prisma.js";
import { assetTypeForMarket, marketDataProvider, marketLabelFor, normalizeMarketMode, type MarketMode } from "./marketDataProvider.js";
import type { MockStock } from "../data/mockStocks.js";
import { buildProfessionalAssessment, professionalDecisionLabel, type ProfessionalAssessment } from "./professionalEngine.js";
import { applyStrongStrategyAssessment, evaluateStrongStockStrategy } from "./strategy/strongStrategyService.js";

export type ScannerFilters = {
  market?: MarketMode;
  minPrice?: number;
  maxPrice?: number;
  minMarketCap?: number;
  minVolume?: number;
  minRelativeVolume?: number;
  minScore?: number;
  excludePennyStocks?: boolean;
  excludeLowLiquidity?: boolean;
};

type ScoredSignal = {
  ticker: string;
  signalType: string;
  score: number;
  riskLevel: string;
  decision: string;
  explanation: string;
  price: number;
  dailyChangePercent: number;
  relativeVolume: number;
  professional: ProfessionalAssessment;
};

const defaultFilters: Required<ScannerFilters> = {
  market: "stocks",
  minPrice: 10,
  maxPrice: 10_000,
  minMarketCap: 0,
  minVolume: 0,
  minRelativeVolume: 0,
  minScore: 0,
  excludePennyStocks: true,
  excludeLowLiquidity: false
};

const cryptoDefaultFilters: Required<ScannerFilters> = {
  market: "crypto",
  minPrice: 0.0001,
  maxPrice: 1_000_000,
  minMarketCap: 100_000_000,
  minVolume: 5_000_000,
  minRelativeVolume: 0.5,
  minScore: 0,
  excludePennyStocks: false,
  excludeLowLiquidity: true
};

const sectorStrengthThreshold = 2;

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const relativeVolumeFor = (stock: MockStock) => Number((stock.volume / stock.avgVolume).toFixed(2));

export function getDecision(score: number) {
  if (score < 40) return "AVOID";
  if (score < 60) return "WEAK_WATCH";
  if (score < 75) return "WATCH";
  if (score < 90) return "STRONG_WATCH";
  return "PAPER_TRADE_CANDIDATE";
}

export function getRiskLevel(stock: MockStock) {
  if (stock.dailyChangePercent > 20 || stock.marketCap < 2_000_000_000 || stock.fundamentalsQuality < 35) {
    return "High";
  }

  if (stock.dailyChangePercent > 10 || relativeVolumeFor(stock) > 3 || stock.fundamentalsQuality < 60) {
    return "Medium";
  }

  return "Low";
}

export function detectSignalType(stock: MockStock, sectorStrongCount: number) {
  if (stock.dailyChangePercent > 20 && stock.marketCap < 10_000_000_000) return "High-risk pump";
  if (stock.dailyChangePercent > 5 && relativeVolumeFor(stock) > 2) return "Momentum breakout";
  if (stock.dailyChangePercent < -7 && stock.fundamentalsQuality > 70) return "Oversold rebound";
  if (sectorStrongCount >= sectorStrengthThreshold && stock.dailyChangePercent > 3) return "Sector strength";
  if (stock.newsCatalyst) return "News catalyst";
  return stock.fundamentalsQuality < 40 ? "Avoid / low quality" : "News catalyst";
}

export function scoreStock(stock: MockStock) {
  const newsScore = stock.newsCatalyst ? 78 : 30;
  const volumeScore = clamp(relativeVolumeFor(stock) * 32);
  const momentumScore = clamp(50 + stock.dailyChangePercent * 3);
  const fundamentalScore = clamp(stock.fundamentalsQuality);
  const valuationScore = clamp(stock.valuationScore);
  const liquidityScore = clamp(Math.log10(Math.max(stock.volume, 1)) * 12);
  const riskScore = clamp(
    100 -
      (stock.dailyChangePercent > 20 ? 35 : 0) -
      (stock.marketCap < 2_000_000_000 ? 25 : 0) -
      (stock.fundamentalsQuality < 40 ? 25 : 0)
  );

  return Math.round(
    newsScore * 0.2 +
      volumeScore * 0.15 +
      momentumScore * 0.15 +
      fundamentalScore * 0.2 +
      valuationScore * 0.1 +
      liquidityScore * 0.1 +
      riskScore * 0.1
  );
}

function mergeFilters(filters: ScannerFilters = {}) {
  const market = normalizeMarketMode(filters.market);
  const baseFilters = market === "crypto" ? cryptoDefaultFilters : defaultFilters;
  return { ...baseFilters, ...filters, market };
}

function passesFilters(stock: MockStock, filters: Required<ScannerFilters>) {
  const pennyBlock = filters.excludePennyStocks ? stock.price > 5 : stock.price > filters.minPrice;
  const relativeVolume = relativeVolumeFor(stock);
  const liquidityBlock = filters.excludeLowLiquidity
    ? stock.volume >= filters.minVolume && relativeVolume >= filters.minRelativeVolume
    : true;

  return (
    stock.price >= filters.minPrice &&
    stock.price <= filters.maxPrice &&
    stock.marketCap >= filters.minMarketCap &&
    stock.volume >= filters.minVolume &&
    relativeVolume >= filters.minRelativeVolume &&
    stock.dailyChangePercent >= -20 &&
    stock.dailyChangePercent <= 25 &&
    pennyBlock &&
    liquidityBlock
  );
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runMarketScan(filters: ScannerFilters = {}) {
  const mergedFilters = mergeFilters(filters);
  const assetType = assetTypeForMarket(mergedFilters.market);
  const stocks = await marketDataProvider.getMarketUniverse(mergedFilters.market);

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { ticker: stock.ticker },
      update: {
        companyName: stock.companyName,
        sector: stock.sector,
        industry: stock.industry,
        marketCap: stock.marketCap,
        price: stock.price,
        previousClose: stock.previousClose,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
        relativeVolume: Number((stock.volume / stock.avgVolume).toFixed(2)),
        dailyChangePercent: stock.dailyChangePercent
      },
      create: {
        ticker: stock.ticker,
        companyName: stock.companyName,
        sector: stock.sector,
        industry: stock.industry,
        marketCap: stock.marketCap,
        price: stock.price,
        previousClose: stock.previousClose,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
        relativeVolume: Number((stock.volume / stock.avgVolume).toFixed(2)),
        dailyChangePercent: stock.dailyChangePercent
      }
    });
  }

  const strongBySector = stocks.reduce<Record<string, number>>((counts, stock) => {
    if (stock.dailyChangePercent > 3 && relativeVolumeFor(stock) > 1.3) {
      counts[stock.sector] = (counts[stock.sector] ?? 0) + 1;
    }
    return counts;
  }, {});

  const filteredStocks = stocks.filter((stock) => passesFilters(stock, mergedFilters));
  const evaluatedSignals = await mapWithConcurrency(filteredStocks, 4, async (stock): Promise<ScoredSignal> => {
    let assessment = buildProfessionalAssessment(stock, mergedFilters.market, stocks);
    let signalType = detectSignalType(stock, strongBySector[stock.sector] ?? 0);

    if (mergedFilters.market === "stocks") {
      const setup = await evaluateStrongStockStrategy(stock);
      assessment = applyStrongStrategyAssessment(assessment, setup);
      signalType = setup.actionable ? "Trend breakout ready" : setup.status === "WATCH" ? "Trend breakout watch" : "No valid breakout";
    } else {
      assessment = {
        ...assessment,
        decision: "NO_TRADE",
        decisionLabel: "No Trade",
        strategy: { ...assessment.strategy, autoTradeAllowed: false, status: "NEW", reducedSize: true },
        noTradeReasons: [...assessment.noTradeReasons, "Automatic crypto trading is disabled in the focused stock-strategy release."]
      };
    }

    return {
      ticker: stock.ticker,
      signalType,
      score: assessment.score,
      riskLevel: assessment.riskLevel,
      decision: assessment.decision,
      explanation:
        mergedFilters.market === "stocks"
          ? `${stock.ticker}: ${assessment.strategy.name} scored ${assessment.score}/100. ${assessment.strategy.reason} ${assessment.noTradeReasons[0] ?? "All mandatory rules passed."}`
          : `${stock.ticker} remains watchlist-only because this release concentrates automatic paper trading on liquid US stock breakouts.`,
      price: stock.price,
      dailyChangePercent: stock.dailyChangePercent,
      relativeVolume: Number((stock.volume / Math.max(stock.avgVolume, 1)).toFixed(2)),
      professional: assessment
    };
  });

  const signals: ScoredSignal[] = evaluatedSignals
    .filter((signal) => signal.score >= mergedFilters.minScore)
    .sort((left, right) => right.score - left.score);

  const scan = await prisma.marketScan.create({
    data: {
      assetType,
      market: marketLabelFor(mergedFilters.market),
      totalScanned: stocks.length,
      signals: {
        create: signals.map((signal) => ({
          assetType,
          ticker: signal.ticker,
          signalType: signal.signalType,
          score: signal.score,
          riskLevel: signal.riskLevel,
          decision: signal.decision,
          explanation: signal.explanation,
          price: signal.price,
          dailyChangePercent: signal.dailyChangePercent,
          relativeVolume: signal.relativeVolume,
          scoreBreakdownJson: JSON.stringify(signal.professional.scoreBreakdown),
          checklistJson: JSON.stringify(signal.professional.checklist),
          strategyName: signal.professional.strategy.name,
          strategyStatus: signal.professional.strategy.status,
          researchQuality: signal.professional.researchQuality,
          noTradeReasonsJson: JSON.stringify(signal.professional.noTradeReasons),
          evidenceJson: JSON.stringify(signal.professional.evidence),
          strategyProofJson: JSON.stringify(signal.professional.strategyProof)
        }))
      }
    },
    include: {
      signals: {
        orderBy: { score: "desc" }
      }
    }
  });

  return scan;
}

export async function getLatestScan(market?: MarketMode) {
  const selectedMarket = market ? normalizeMarketMode(market) : undefined;
  return prisma.marketScan.findFirst({
    where: selectedMarket ? { assetType: assetTypeForMarket(selectedMarket) } : undefined,
    orderBy: { scanDate: "desc" },
    include: { signals: { orderBy: { score: "desc" } } }
  });
}

export async function getSignals(market?: MarketMode) {
  const latest = await getLatestScan(market);
  return latest?.signals ?? [];
}
