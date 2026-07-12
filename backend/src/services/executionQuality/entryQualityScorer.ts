export type ExecutionGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export function gradeFromScore(score: number): ExecutionGrade {
  if (score >= 95) return "A+";
  if (score >= 88) return "A";
  if (score >= 78) return "B";
  if (score >= 68) return "C";
  if (score >= 55) return "D";
  return "F";
}

export function scoreEntryQuality(input: {
  baseScore: number;
  chasePenalty: number;
  liquidityScore: number;
  riskRewardRatio: number;
  nearResistance: boolean;
  volatilityTooHigh: boolean;
}) {
  const rewardBonus = input.riskRewardRatio >= 2 ? 8 : -25;
  const resistancePenalty = input.nearResistance ? 14 : 0;
  const volatilityPenalty = input.volatilityTooHigh ? 20 : 0;
  const liquidityAdjustment = (input.liquidityScore - 70) * 0.25;
  const entryQuality = Math.round(Math.max(0, Math.min(100, input.baseScore + rewardBonus + liquidityAdjustment - input.chasePenalty - resistancePenalty - volatilityPenalty)));

  return {
    entryQuality,
    executionGrade: gradeFromScore(entryQuality)
  };
}
