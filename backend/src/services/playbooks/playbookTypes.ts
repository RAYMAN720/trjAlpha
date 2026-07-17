import type { AssetType } from "../marketDataProvider.js";

export type StrategyProofLevel = "UNTESTED" | "BACKTESTED_ONLY" | "PAPER_TESTING" | "PAPER_PROVEN" | "DISABLED";

export type PlaybookDefinition = {
  name: string;
  assetType: AssetType;
  allowedRegimes: string[];
  setupConditions: string[];
  entryRules: string[];
  invalidationRules: string[];
  stopLossLogic: string;
  takeProfitLogic: string;
  noTradeConditions: string[];
  riskRules: string[];
  minimumScore: number;
  minimumTimeframeAlignment: "aligned" | "mixed";
  minimumLiquidity: string;
  requiredProofLevel: StrategyProofLevel;
  enabled: boolean;
};

export type PlaybookStatus = PlaybookDefinition & {
  proofLevel: StrategyProofLevel;
  status: "Enabled" | "Testing" | "Disabled" | "Weak";
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  last10Trades: Array<{ ticker: string; result: number; closedAt?: Date | null }>;
  paperOnly: true;
};
