import type { MockStock } from "../data/mockStocks.js";
import { getHistoricalCryptoChart, getLiveCryptoUniverse } from "./cryptoPriceService.js";
import { getHistoricalStockChart, getLiveStockUniverse, type HistoricalPoint, type HistoricalTimeframe } from "./stockPriceService.js";

export type MarketMode = "stocks" | "crypto";
export type AssetType = "stock" | "crypto";
export type ChartTimeframe = HistoricalTimeframe;
export type MarketChartPoint = HistoricalPoint;

export function normalizeMarketMode(value?: unknown): MarketMode {
  return String(value ?? "").toLowerCase() === "crypto" ? "crypto" : "stocks";
}

export function assetTypeForMarket(market?: MarketMode): AssetType {
  return normalizeMarketMode(market) === "crypto" ? "crypto" : "stock";
}

export function normalizeAssetType(value?: unknown): AssetType {
  return String(value ?? "").toLowerCase() === "crypto" ? "crypto" : "stock";
}

export function marketForAssetType(assetType?: string | null): MarketMode {
  return assetType === "crypto" ? "crypto" : "stocks";
}

export function marketLabelFor(market: MarketMode) {
  return market === "crypto" ? "Crypto assets" : "US stocks and ETFs";
}

export interface MarketDataProvider {
  getMarketUniverse(market?: MarketMode): Promise<MockStock[]>;
  getStock(ticker: string, market?: MarketMode): Promise<MockStock | null>;
  getChart(ticker: string, market?: MarketMode, timeframe?: ChartTimeframe): Promise<MarketChartPoint[]>;
}

export class LiveMarketDataProvider implements MarketDataProvider {
  async getMarketUniverse(market: MarketMode = "stocks") {
    return market === "crypto" ? getLiveCryptoUniverse() : getLiveStockUniverse();
  }

  async getStock(ticker: string, market: MarketMode = "stocks") {
    const universe = await this.getMarketUniverse(market);
    return universe.find((stock) => stock.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;
  }

  async getChart(ticker: string, market: MarketMode = "stocks", timeframe: ChartTimeframe = "daily") {
    return market === "crypto"
      ? getHistoricalCryptoChart(ticker, timeframe)
      : getHistoricalStockChart(ticker, timeframe);
  }
}

export const marketDataProvider = new LiveMarketDataProvider();
