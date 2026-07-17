import type { MarketRegimeAssessment } from "./marketRegimeCore.js";

export type CommitteeDecision = "APPROVE_PAPER" | "WATCH" | "REJECT" | "BLOCKED";
export type CommitteeVote = {
  desk: "STRATEGY" | "RISK" | "REGIME" | "EXECUTION" | "DATA" | "AI_RESEARCH";
  weight: number;
  score: number;
  passed: boolean;
  veto: boolean;
  reason: string;
};

export type TradeCommitteeInput = {
  signalScore: number;
  strategyScore: number;
  strategyActionable: boolean;
  strategyStatus: string;
  riskApproved: boolean;
  riskState: string;
  emergencyHalt?: boolean;
  riskRewardRatio: number;
  regime: MarketRegimeAssessment;
  executionGrade: string;
  executionBlocked: boolean;
  dataExecutable: boolean;
  aiRecommendation?: string | null;
  aiConfidence?: number | null;
};

export type TradeCommitteeResult = {
  decision: CommitteeDecision;
  committeeScore: number;
  confidence: number;
  approvedVotes: number;
  totalVotes: number;
  positionSizeMultiplier: number;
  votes: CommitteeVote[];
  reasons: string[];
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function executionScore(grade: string) {
  const scores: Record<string, number> = { "A+": 100, A: 95, B: 80, C: 58, D: 30, F: 0 };
  return scores[grade.toUpperCase()] ?? 45;
}

export function evaluateProfessionalTradeCommittee(input: TradeCommitteeInput): TradeCommitteeResult {
  const status = input.strategyStatus.toUpperCase();
  const strategyPass = input.strategyActionable && input.strategyScore >= 85 && !["WEAK", "DISABLED", "NEW"].includes(status);
  const riskPass = input.riskApproved && !["PAUSED", "LOCKED"].includes(input.riskState.toUpperCase()) && input.riskRewardRatio >= 2;
  const regimePass = input.regime.allowLongBreakouts;
  const executionValue = executionScore(input.executionGrade);
  const executionPass = !input.executionBlocked && executionValue >= 75;
  const aiRecommendation = (input.aiRecommendation ?? "neutral").toLowerCase();
  const aiConfidence = clamp(input.aiConfidence ?? 55);
  const aiScore = aiRecommendation === "approve" ? aiConfidence : aiRecommendation === "reject" ? 100 - aiConfidence : 55;

  const votes: CommitteeVote[] = [
    {
      desk: "STRATEGY",
      weight: 30,
      score: clamp((input.strategyScore * 0.8) + (input.signalScore * 0.2)),
      passed: strategyPass,
      veto: !strategyPass,
      reason: strategyPass
        ? `Strategy is actionable at ${input.strategyScore}/100.`
        : `Strategy is not fully actionable or its status (${input.strategyStatus}) is not eligible.`
    },
    {
      desk: "RISK",
      weight: 25,
      score: riskPass ? 100 : 0,
      passed: riskPass,
      veto: !riskPass,
      reason: riskPass
        ? `Risk state ${input.riskState} and reward/risk ${input.riskRewardRatio.toFixed(2)} pass.`
        : `Risk approval, risk state, or minimum 2:1 reward/risk failed.`
    },
    {
      desk: "REGIME",
      weight: 15,
      score: input.regime.longScore,
      passed: regimePass,
      veto: input.regime.regime === "RISK_OFF" || input.regime.positionSizeMultiplier === 0,
      reason: input.regime.summary
    },
    {
      desk: "EXECUTION",
      weight: 15,
      score: executionValue,
      passed: executionPass,
      veto: input.executionGrade.toUpperCase() === "F",
      reason: executionPass
        ? `Execution grade ${input.executionGrade} is acceptable.`
        : `Execution grade ${input.executionGrade} or execution guardrails failed.`
    },
    {
      desk: "DATA",
      weight: 10,
      score: input.dataExecutable ? 100 : 0,
      passed: input.dataExecutable,
      veto: !input.dataExecutable,
      reason: input.dataExecutable ? "Quote is fresh, trusted, and executable." : "Quote is stale, untrusted, or unavailable."
    },
    {
      desk: "AI_RESEARCH",
      weight: 5,
      score: aiScore,
      passed: aiRecommendation !== "reject" || aiConfidence < 80,
      veto: false,
      reason: aiRecommendation === "neutral"
        ? "AI research is unavailable or neutral; deterministic desks remain authoritative."
        : `AI research recommendation is ${aiRecommendation} at ${aiConfidence.toFixed(0)}% confidence.`
    }
  ];

  const weighted = votes.reduce((sum, vote) => sum + vote.score * vote.weight, 0) / votes.reduce((sum, vote) => sum + vote.weight, 0);
  const committeeScore = Math.round(clamp(weighted));
  const vetoes = votes.filter((vote) => vote.veto);
  const approvedVotes = votes.filter((vote) => vote.passed).length;
  const reasons = vetoes.map((vote) => `${vote.desk}: ${vote.reason}`);

  let decision: CommitteeDecision;
  if (input.emergencyHalt || !input.dataExecutable || !input.riskApproved || ["PAUSED", "LOCKED"].includes(input.riskState.toUpperCase())) {
    decision = "BLOCKED";
  } else if (!strategyPass || vetoes.length > 0) {
    decision = "REJECT";
  } else if (committeeScore >= 82 && approvedVotes >= 5 && regimePass && executionPass) {
    decision = "APPROVE_PAPER";
  } else {
    decision = "WATCH";
  }

  if (input.emergencyHalt) reasons.unshift("System emergency halt is active.");
  if (!reasons.length && decision !== "APPROVE_PAPER") reasons.push("Committee agreement is not strong enough for an active paper position.");
  if (decision === "APPROVE_PAPER") reasons.push("All mandatory desks passed and the weighted committee score met the professional threshold.");

  const statusMultiplier = status === "PROVEN" ? 1 : status === "TESTING" ? 0.5 : 0;
  const riskMultiplier = input.riskState.toUpperCase() === "REDUCED_SIZE" ? 0.5 : 1;
  const executionMultiplier = executionValue >= 90 ? 1 : executionValue >= 75 ? 0.75 : 0;
  const positionSizeMultiplier = decision === "APPROVE_PAPER"
    ? Number(Math.min(statusMultiplier, riskMultiplier, input.regime.positionSizeMultiplier, executionMultiplier).toFixed(2))
    : 0;

  const confidence = Math.round(
    clamp(committeeScore * 0.7 + input.regime.confidence * 0.2 + (approvedVotes / votes.length) * 10)
  );

  return {
    decision,
    committeeScore,
    confidence,
    approvedVotes,
    totalVotes: votes.length,
    positionSizeMultiplier,
    votes,
    reasons
  };
}
