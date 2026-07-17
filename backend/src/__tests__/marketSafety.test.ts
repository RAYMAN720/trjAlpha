import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MockStock } from "../data/mockStocks.js";
import { getUsEquityMarketClock } from "../services/marketClockService.js";
import { checkQuoteForExecution } from "../services/marketSafetyService.js";

function quote(overrides: Partial<MockStock> = {}): MockStock {
  return {
    ticker: "NVDA",
    companyName: "NVIDIA",
    sector: "Technology",
    industry: "Semiconductors",
    price: 150,
    previousClose: 149,
    dailyChangePercent: 0.67,
    volume: 10_000_000,
    avgVolume: 8_000_000,
    marketCap: 1_000_000_000,
    newsCatalyst: "Test",
    fundamentalsQuality: 80,
    valuationScore: 60,
    quoteSource: "Yahoo Finance public quote feed",
    quoteUpdatedAt: "2026-07-13T14:00:00.000Z",
    marketState: "Regular",
    ...overrides
  };
}

describe("market execution safeguards", () => {
  it("recognizes a normal US equity session", () => {
    const status = getUsEquityMarketClock(new Date("2026-07-13T14:00:00.000Z"));
    assert.equal(status.open, true);
  });

  it("blocks weekends and observed exchange holidays", () => {
    assert.equal(getUsEquityMarketClock(new Date("2026-07-12T14:00:00.000Z")).open, false);
    assert.equal(getUsEquityMarketClock(new Date("2026-07-03T14:00:00.000Z")).open, false);
  });

  it("accepts a fresh trusted stock quote during market hours", () => {
    const result = checkQuoteForExecution(quote(), "stock", { now: new Date("2026-07-13T14:05:00.000Z") });
    assert.equal(result.executable, true);
  });

  it("rejects stale and static quotes", () => {
    const stale = checkQuoteForExecution(quote(), "stock", { now: new Date("2026-07-13T15:00:00.000Z") });
    const fallback = checkQuoteForExecution(
      quote({ quoteSource: "Static reference data (not executable)", quoteUpdatedAt: "" }),
      "stock",
      { now: new Date("2026-07-13T14:05:00.000Z") }
    );
    assert.equal(stale.executable, false);
    assert.equal(fallback.executable, false);
  });
});
