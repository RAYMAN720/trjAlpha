import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { marketDataProvider, type MarketMode } from "../../services/marketDataProvider.js";
import { redis } from "../../infrastructure/redisClient.js";

const D = Prisma.Decimal;
export type NormalizedQuote = {
  symbol: string;
  bid: string | null;
  ask: string | null;
  last: string;
  currency: string;
  provider: string;
  sourceTs: string;
};

export async function getNormalizedQuote(symbol: string, market: MarketMode = "stocks"): Promise<NormalizedQuote | null> {
  const clean = symbol.toUpperCase().trim();
  const cacheKey = `quote:${market}:${clean}`;
  if (redis.configured()) {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as NormalizedQuote;
  }
  const asset = await marketDataProvider.getStock(clean, market);
  if (!asset) return null;
  const quote: NormalizedQuote = {
    symbol: clean,
    bid: null,
    ask: null,
    last: new D(asset.price).toString(),
    currency: "USD",
    provider: "TRADEPILOT_NORMALIZED",
    sourceTs: new Date().toISOString()
  };
  await prisma.marketQuoteCache.upsert({
    where: { symbol_provider: { symbol: clean, provider: quote.provider } },
    update: { last: new D(quote.last), sourceTs: new Date(quote.sourceTs), receivedAt: new Date() },
    create: { symbol: clean, provider: quote.provider, last: new D(quote.last), currency: quote.currency, sourceTs: new Date(quote.sourceTs) }
  }).catch(() => undefined);
  if (redis.configured()) await redis.setEx(cacheKey, 5, JSON.stringify(quote)).catch(() => undefined);
  return quote;
}
