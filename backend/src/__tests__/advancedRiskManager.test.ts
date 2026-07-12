import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countConsecutiveLosses } from "../services/risk/advancedRiskManager.js";

describe("advanced risk manager helpers", () => {
  it("counts only the current loss streak", () => {
    assert.equal(countConsecutiveLosses([
      { profitLoss: -4 },
      { profitLoss: -2 },
      { profitLoss: 5 },
      { profitLoss: -10 }
    ]), 2);
  });

  it("returns zero when the most recent trade is not a loss", () => {
    assert.equal(countConsecutiveLosses([
      { profitLoss: 0 },
      { profitLoss: -4 }
    ]), 0);
    assert.equal(countConsecutiveLosses([
      { profitLoss: 2 },
      { profitLoss: -4 }
    ]), 0);
  });

  it("counts the full streak when every recent trade lost", () => {
    assert.equal(countConsecutiveLosses([
      { profitLoss: -1 },
      { profitLoss: -2 },
      { profitLoss: -3 }
    ]), 3);
  });
});
