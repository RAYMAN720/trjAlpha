import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketRegimeAssessment } from "../services/professional/marketRegimeCore.js";
import { evaluateProfessionalTradeCommittee } from "../services/professional/tradeCommitteeCore.js";

const bullishRegime: MarketRegimeAssessment = {
  regime: "BULL_TREND",
  longScore: 88,
  confidence: 82,
  allowLongBreakouts: true,
  positionSizeMultiplier: 1,
  metrics: {
    trackedAssets: 25,
    advancersPercent: 68,
    strongAdvancersPercent: 40,
    declinersPercent: 32,
    averageChangePercent: 1.2,
    medianAbsoluteMovePercent: 1.4,
    benchmarkClose: 520,
    benchmarkSma50: 500,
    benchmarkSma200: 460,
    benchmarkReturn20Percent: 4,
    benchmarkVolatility20Percent: 18
  },
  summary: "Broad bullish trend.",
  warnings: []
};

function validInput() {
  return {
    signalScore: 92,
    strategyScore: 94,
    strategyActionable: true,
    strategyStatus: "PROVEN",
    riskApproved: true,
    riskState: "NORMAL",
    riskRewardRatio: 2.5,
    regime: bullishRegime,
    executionGrade: "A",
    executionBlocked: false,
    dataExecutable: true,
    aiRecommendation: "approve",
    aiConfidence: 80
  } as const;
}

describe("professional trade committee", () => {
  it("approves only when mandatory desks pass", () => {
    const result = evaluateProfessionalTradeCommittee(validInput());
    assert.equal(result.decision, "APPROVE_PAPER");
    assert.equal(result.approvedVotes, 6);
    assert.ok(result.positionSizeMultiplier > 0);
  });

  it("lets risk and data veto an otherwise strong setup", () => {
    const riskBlocked = evaluateProfessionalTradeCommittee({ ...validInput(), riskApproved: false, riskState: "PAUSED" });
    const staleData = evaluateProfessionalTradeCommittee({ ...validInput(), dataExecutable: false });
    assert.equal(riskBlocked.decision, "BLOCKED");
    assert.equal(staleData.decision, "BLOCKED");
    assert.equal(riskBlocked.positionSizeMultiplier, 0);
  });

  it("does not let AI approval rescue a hostile regime", () => {
    const result = evaluateProfessionalTradeCommittee({
      ...validInput(),
      regime: { ...bullishRegime, regime: "RISK_OFF", allowLongBreakouts: false, positionSizeMultiplier: 0, longScore: 15 }
    });
    assert.equal(result.decision, "REJECT");
    assert.ok(result.votes.some((vote) => vote.desk === "REGIME" && vote.veto));
  });
});
