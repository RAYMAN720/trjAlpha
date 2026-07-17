import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateProfessionalFill } from "../services/professional/executionSimulator.js";

const liquidAsset = { price: 100, avgVolume: 12_000_000, dailyChangePercent: 1.2, marketState: "Regular" };

describe("professional execution simulator", () => {
  it("fills buys above the reference and sells below it", () => {
    const buy = simulateProfessionalFill({ side: "BUY", referencePrice: 100, quantity: 25, asset: liquidAsset, seed: "same" });
    const sell = simulateProfessionalFill({ side: "SELL", referencePrice: 100, quantity: 25, asset: liquidAsset, seed: "same" });
    assert.ok(buy.fillPrice > 100);
    assert.ok(sell.fillPrice < 100);
    assert.equal(buy.filledQuantity, 25);
    assert.ok(buy.fee > 0);
    assert.ok(["A", "B", "C"].includes(buy.qualityGrade));
  });

  it("models partial fills when an order is too large for minute liquidity", () => {
    const result = simulateProfessionalFill({
      side: "BUY",
      referencePrice: 20,
      quantity: 100_000,
      asset: { price: 20, avgVolume: 100_000, dailyChangePercent: 5, marketState: "Pre-market" },
      seed: "illiquid"
    });
    assert.equal(result.partialFill, true);
    assert.ok(result.filledQuantity < result.requestedQuantity);
    assert.ok(result.warnings.length > 0);
  });

  it("is deterministic for the same market input and seed", () => {
    const first = simulateProfessionalFill({ side: "BUY", referencePrice: 75, quantity: 10, asset: liquidAsset, seed: "replay" });
    const second = simulateProfessionalFill({ side: "BUY", referencePrice: 75, quantity: 10, asset: liquidAsset, seed: "replay" });
    assert.deepEqual(first, second);
  });
});
