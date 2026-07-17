import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyProfessionalMarketRegime } from "../services/professional/marketRegimeCore.js";

function benchmark(start: number, drift: number, count = 230) {
  return Array.from({ length: count }, (_, index) => ({ close: start + index * drift, date: new Date(2025, 0, index + 1).toISOString() }));
}

describe("professional market regime", () => {
  it("allows long breakouts only in a broad bullish trend", () => {
    const universe = Array.from({ length: 20 }, (_, index) => ({
      ticker: `S${index}`,
      price: 100 + index,
      previousClose: 99 + index,
      dailyChangePercent: index < 15 ? 1.4 : -0.2
    }));
    const result = classifyProfessionalMarketRegime({ universe, benchmarkHistory: benchmark(300, 0.8) });
    assert.equal(result.regime, "BULL_TREND");
    assert.equal(result.allowLongBreakouts, true);
    assert.equal(result.positionSizeMultiplier, 1);
    assert.ok(result.longScore >= 65);
  });

  it("turns off long entries during a risk-off tape", () => {
    const universe = Array.from({ length: 20 }, (_, index) => ({
      ticker: `S${index}`,
      price: 100 - index,
      previousClose: 105 - index,
      dailyChangePercent: -3 - index * 0.03
    }));
    const result = classifyProfessionalMarketRegime({ universe, benchmarkHistory: benchmark(500, -1.2) });
    assert.equal(result.regime, "RISK_OFF");
    assert.equal(result.allowLongBreakouts, false);
    assert.equal(result.positionSizeMultiplier, 0);
  });
});
