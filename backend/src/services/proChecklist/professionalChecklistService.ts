import type { MockStock } from "../../data/mockStocks.js";
import type { AssetType } from "../marketDataProvider.js";
import type { ProfessionalAssessment } from "../professionalEngine.js";
import type { MultiTimeframeResult } from "../multiTimeframe/multiTimeframeEngine.js";
import type { ExecutionQualityResult } from "../executionQuality/executionQualityEngine.js";
import type { RiskState } from "../risk/advancedRiskManager.js";

export type ChecklistStatus = "PASS" | "WARNING" | "FAIL";

export type ProfessionalChecklistItem = {
  label: string;
  status: ChecklistStatus;
  explanation: string;
  hardFail: boolean;
};

function item(label: string, status: ChecklistStatus, explanation: string, hardFail = status === "FAIL"): ProfessionalChecklistItem {
  return { label, status, explanation, hardFail };
}

export function buildProfessionalChecklist(input: {
  assetType: AssetType;
  stock: MockStock;
  assessment: ProfessionalAssessment;
  timeframe: MultiTimeframeResult;
  execution: ExecutionQualityResult;
  riskState: RiskState;
  riskRewardRatio: number;
  stopLoss: number;
  positionSize: number;
  openTrades: number;
  maxOpenTrades: number;
  dailyLossReached: boolean;
}) {
  const researchLow = input.assessment.researchQuality === "LOW QUALITY";
  const strategyBlocked = input.assessment.strategy.status === "WEAK" || input.assessment.strategy.status === "DISABLED";
  const entryLate = input.execution.chaseRisk === "high";
  const timeframeConflict = input.timeframe.alignment === "conflicting";
  const items = [
    item("Market regime acceptable", input.assessment.marketRegime.riskOff ? "FAIL" : "PASS", input.assessment.marketRegime.summary),
    item("Sector/narrative aligned", input.assessment.catalystConfirmed ? "PASS" : "WARNING", input.assessment.catalystConfirmed ? "Catalyst or narrative checked." : "No confirmed catalyst."),
    item("Timeframes aligned", timeframeConflict ? "FAIL" : input.timeframe.alignment === "mixed" ? "WARNING" : "PASS", input.timeframe.warning ?? `Alignment is ${input.timeframe.alignment}.`),
    item("Strategy playbook matched", input.assessment.strategy.name === "Unclassified" ? "FAIL" : "PASS", input.assessment.strategy.name),
    item("Liquidity acceptable", input.assessment.liquidityPassed ? "PASS" : "FAIL", `Relative volume ${input.stock.volume / Math.max(1, input.stock.avgVolume)}.`),
    item("Volume confirms", input.stock.volume >= (input.assetType === "crypto" ? 5_000_000 : 1_000_000) ? "PASS" : "FAIL", "Volume must meet the asset-class minimum."),
    item("Entry not late", entryLate ? "FAIL" : input.execution.chaseRisk === "medium" ? "WARNING" : "PASS", input.execution.warnings.find((warning) => warning.includes("move")) ?? "Entry is not extended."),
    item("Risk/reward >= 2:1", input.riskRewardRatio >= 2 ? "PASS" : "FAIL", `${input.riskRewardRatio.toFixed(2)}:1 planned reward/risk.`),
    item("Stop-loss exists", input.stopLoss > 0 ? "PASS" : "FAIL", `Stop-loss ${input.stopLoss}.`),
    item("Position size valid", input.positionSize > 0 ? "PASS" : "FAIL", `Position size ${input.positionSize}.`),
    item("Daily loss limit not reached", input.dailyLossReached ? "FAIL" : "PASS", input.dailyLossReached ? "Daily loss limit reached." : "Daily loss guard is clear."),
    item("Max open trades not reached", input.openTrades < input.maxOpenTrades ? "PASS" : "FAIL", `${input.openTrades}/${input.maxOpenTrades} open paper trades.`),
    item("Research quality not low", researchLow ? "FAIL" : input.assessment.researchQuality === "LIMITED" ? "WARNING" : "PASS", input.assessment.researchQuality),
    item("Strategy not weak/disabled", strategyBlocked ? "FAIL" : input.assessment.strategy.status === "NEW" ? "WARNING" : "PASS", input.assessment.strategy.status),
    item("Paper performance acceptable", strategyBlocked ? "FAIL" : "PASS", input.assessment.strategyProof.summary),
    item("No major red flag", input.execution.blocked || input.riskState === "LOCKED" || input.riskState === "PAUSED" ? "FAIL" : "PASS", `Execution ${input.execution.executionGrade}, risk state ${input.riskState}.`)
  ];
  const hardFails = items.filter((check) => check.hardFail && check.status === "FAIL");

  return {
    result: hardFails.length ? "BLOCKED" : items.some((check) => check.status === "WARNING") ? "WARNING" : "PASS",
    blocked: hardFails.length > 0,
    items,
    hardFails
  };
}
