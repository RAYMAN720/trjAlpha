import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MockStock } from "../data/mockStocks.js";
import type { MarketChartPoint } from "../services/marketDataProvider.js";
import { evaluateTrendBreakout } from "../services/strategy/trendBreakoutStrategy.js";

function candles(count: number, start: number, drift: number, amplitude: number, volume = 2_000_000): MarketChartPoint[] {
  const result: MarketChartPoint[] = [];
  let previous = start;
  for (let index = 0; index < count; index += 1) {
    const close = start + index * drift + Math.sin(index / 2) * amplitude;
    const open = previous;
    const high = Math.max(open, close) + amplitude * 0.8;
    const low = Math.min(open, close) - amplitude * 0.8;
    result.push({
      date: new Date(Date.UTC(2025, 0, 1 + index, 15, 30)).toISOString(),
      open,
      high,
      low,
      close,
      price: close,
      volume,
      source: "test historical data"
    });
    previous = close;
  }
  return result;
}

function intraday(count: number, start: number, step: number, minutes: number): MarketChartPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * step + Math.sin(index / 4) * step;
    return {
      date: new Date(Date.UTC(2026, 6, 10, 14, 30 + index * minutes)).toISOString(),
      open: close - step * 0.3,
      high: close + step * 0.4,
      low: close - step * 0.5,
      close,
      price: close,
      volume: 100_000 + index * 2_000,
      source: "test intraday data"
    };
  });
}

function validFixture() {
  const daily = candles(230, 75, 0.14, 2);
  const benchmark = candles(230, 400, 0.22, 2.2, 50_000_000);
  const priorHigh = Math.max(...daily.slice(-21, -1).map((item) => item.high));
  const last = daily.at(-1)!;
  last.open = priorHigh * 0.997;
  last.low = priorHigh * 0.992;
  last.high = priorHigh * 1.012;
  last.close = priorHigh * 1.006;
  last.price = last.close;
  last.volume = 4_500_000;
  const stock: MockStock = {
    ticker: "TEST",
    companyName: "Test Corp",
    sector: "Technology",
    industry: "Software",
    marketCap: 30_000_000_000,
    price: last.close,
    previousClose: daily.at(-2)!.close,
    volume: Math.round(last.volume),
    avgVolume: 2_000_000,
    dailyChangePercent: ((last.close - daily.at(-2)!.close) / daily.at(-2)!.close) * 100,
    newsCatalyst: "",
    fundamentalsQuality: 50,
    valuationScore: 50,
    quoteSource: "Alpaca Market Data (sip)",
    quoteUpdatedAt: new Date().toISOString(),
    marketState: "Latest trade"
  };
  const fifteen = intraday(20, last.close * 0.97, last.close * 0.0014, 15);
  const hourly = intraday(80, last.close * 0.8, last.close * 0.0025, 60);
  return { stock, daily, benchmark, fifteen, hourly };
}

describe("Trend Breakout V2", () => {
  it("accepts only a fully confirmed, liquid breakout", () => {
    const { stock, daily, benchmark, fifteen, hourly } = validFixture();
    const result = evaluateTrendBreakout({ stock, daily, benchmarkDaily: benchmark, intraday15m: fifteen, hourly });
    assert.equal(result.strategyName, "Trend Breakout V2");
    assert.equal(result.dataQuality, "HIGH");
    assert.ok(result.score >= 85, JSON.stringify(result.blockingReasons));
    assert.equal(result.actionable, true, JSON.stringify(result.blockingReasons));
    assert.equal(result.riskPlan.riskReward, 2.5);
    assert.ok(result.riskPlan.stopLoss < stock.price);
  });

  it("blocks a chased entry more than 0.75 ATR above resistance", () => {
    const { stock, daily, benchmark, fifteen, hourly } = validFixture();
    stock.price *= 1.08;
    const result = evaluateTrendBreakout({ stock, daily, benchmarkDaily: benchmark, intraday15m: fifteen, hourly });
    assert.equal(result.actionable, false);
    assert.ok(result.blockingReasons.some((reason) => reason.includes("extended")));
  });

  it("does not use a static catalyst to rescue a weak setup", () => {
    const { stock, daily, benchmark, fifteen, hourly } = validFixture();
    stock.newsCatalyst = "Static marketing catalyst";
    daily.at(-1)!.volume = 100_000;
    const result = evaluateTrendBreakout({ stock, daily, benchmarkDaily: benchmark, intraday15m: fifteen, hourly });
    assert.equal(result.actionable, false);
    assert.ok(result.blockingReasons.some((reason) => reason.includes("volume")));
  });
  it("uses time-adjusted intraday volume so an incomplete daily bar is not unfairly rejected", () => {
    const { stock, daily, benchmark, hourly } = validFixture();
    daily.at(-1)!.volume = 400_000;
    stock.marketCap = 1;
    const sessions: MarketChartPoint[] = [];
    for (let day = 0; day < 6; day += 1) {
      for (let bar = 0; bar < 4; bar += 1) {
        const close = stock.price * (0.978 + day * 0.001 + bar * 0.0015);
        sessions.push({
          date: new Date(Date.UTC(2026, 6, 6 + day, 14, 0 + bar * 15)).toISOString(),
          open: close * 0.999,
          high: close * 1.002,
          low: close * 0.998,
          close,
          price: close,
          volume: day === 5 ? 220_000 : 100_000,
          source: "test time-adjusted volume"
        });
      }
    }
    const result = evaluateTrendBreakout({ stock, daily, benchmarkDaily: benchmark, intraday15m: sessions, hourly });
    assert.equal(result.metrics.volumeBasis, "time-adjusted intraday");
    assert.ok(result.metrics.volumeRatio >= 2);
    assert.equal(result.actionable, true, JSON.stringify(result.blockingReasons));
  });

});
