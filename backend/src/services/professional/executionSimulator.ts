export type ExecutionSide = "BUY" | "SELL";

export type ExecutionAsset = {
  price: number;
  avgVolume: number;
  dailyChangePercent: number;
  marketState?: string;
};

export type ExecutionSimulationInput = {
  side: ExecutionSide;
  referencePrice: number;
  quantity: number;
  asset: ExecutionAsset;
  latencyMs?: number;
  maxParticipationRate?: number;
  commissionPerShare?: number;
  minimumCommission?: number;
  seed?: string;
};

export type ExecutionSimulationResult = {
  side: ExecutionSide;
  requestedPrice: number;
  requestedQuantity: number;
  filledQuantity: number;
  partialFill: boolean;
  fillPrice: number;
  estimatedBid: number;
  estimatedAsk: number;
  spreadBps: number;
  slippageBps: number;
  totalExecutionBps: number;
  slippageAmount: number;
  fee: number;
  latencyMs: number;
  participationRate: number;
  qualityGrade: "A" | "B" | "C" | "D" | "F";
  modelVersion: "professional-fill-v1";
  warnings: string[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const money = (value: number) => Number(value.toFixed(4));

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function professionalExecutionConfigFromEnv() {
  return {
    latencyMs: envNumber("SIM_EXECUTION_LATENCY_MS", 180),
    maxParticipationRate: envNumber("SIM_MAX_MINUTE_VOLUME_PARTICIPATION", 0.05),
    commissionPerShare: envNumber("SIM_COMMISSION_PER_SHARE", 0.0035),
    minimumCommission: envNumber("SIM_MINIMUM_COMMISSION", 0.25)
  };
}

function deterministicUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function baseSpreadBps(dollarVolume: number) {
  if (dollarVolume >= 10_000_000_000) return 1;
  if (dollarVolume >= 2_000_000_000) return 1.8;
  if (dollarVolume >= 500_000_000) return 3.5;
  if (dollarVolume >= 100_000_000) return 7;
  if (dollarVolume >= 25_000_000) return 12;
  return 22;
}

function grade(totalBps: number): ExecutionSimulationResult["qualityGrade"] {
  if (totalBps <= 4) return "A";
  if (totalBps <= 8) return "B";
  if (totalBps <= 15) return "C";
  if (totalBps <= 25) return "D";
  return "F";
}

export function simulateProfessionalFill(input: ExecutionSimulationInput): ExecutionSimulationResult {
  if (!Number.isFinite(input.referencePrice) || input.referencePrice <= 0) throw new Error("Reference price must be positive.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be positive.");
  if (!Number.isFinite(input.asset.avgVolume) || input.asset.avgVolume <= 0) throw new Error("Average volume must be positive.");

  const requestedQuantity = Math.max(1, Math.floor(input.quantity));
  const latencyMs = Math.max(0, Math.floor(input.latencyMs ?? 180));
  const maxParticipationRate = clamp(input.maxParticipationRate ?? 0.05, 0.001, 0.2);
  const commissionPerShare = Math.max(0, input.commissionPerShare ?? 0.0035);
  const minimumCommission = Math.max(0, input.minimumCommission ?? 0.25);
  const minuteVolume = Math.max(1, input.asset.avgVolume / 390);
  const availableQuantity = Math.max(1, Math.floor(minuteVolume * maxParticipationRate));
  const filledQuantity = Math.min(requestedQuantity, availableQuantity);
  const partialFill = filledQuantity < requestedQuantity;
  const participationRate = filledQuantity / minuteVolume;
  const dollarVolume = input.referencePrice * input.asset.avgVolume;
  const session = (input.asset.marketState ?? "Regular").toLowerCase();
  const offHoursMultiplier = session.includes("pre") || session.includes("post") ? 2.5 : 1;
  const volatilityComponent = clamp(Math.abs(input.asset.dailyChangePercent) * 0.35, 0, 10);
  const jitter = (deterministicUnit(input.seed ?? `${input.side}:${input.referencePrice}:${requestedQuantity}`) - 0.5) * 0.8;
  const spreadBps = clamp((baseSpreadBps(dollarVolume) + volatilityComponent + jitter) * offHoursMultiplier, 0.5, 60);
  const impactBps = clamp(Math.sqrt(Math.max(0, participationRate)) * 12, 0, 25);
  const latencyBps = clamp((latencyMs / 1000) * (0.7 + Math.abs(input.asset.dailyChangePercent) * 0.08), 0, 8);
  const slippageBps = clamp(0.5 + volatilityComponent * 0.45 + impactBps + latencyBps, 0.25, 50);
  const halfSpread = input.referencePrice * (spreadBps / 20_000);
  const estimatedBid = input.referencePrice - halfSpread;
  const estimatedAsk = input.referencePrice + halfSpread;
  const referenceAtSide = input.side === "BUY" ? estimatedAsk : estimatedBid;
  const slippagePerShare = input.referencePrice * (slippageBps / 10_000);
  const fillPrice = input.side === "BUY" ? referenceAtSide + slippagePerShare : referenceAtSide - slippagePerShare;
  const slippageAmount = Math.abs(fillPrice - input.referencePrice) * filledQuantity;
  const fee = filledQuantity > 0 ? Math.max(minimumCommission, commissionPerShare * filledQuantity) : 0;
  const totalExecutionBps = spreadBps / 2 + slippageBps;
  const qualityGrade = grade(totalExecutionBps);
  const warnings: string[] = [];

  if (partialFill) warnings.push(`Only ${filledQuantity}/${requestedQuantity} shares were filled under the participation limit.`);
  if (spreadBps >= 15) warnings.push("Estimated bid-ask spread is wide.");
  if (slippageBps >= 15) warnings.push("Estimated market-impact and latency slippage is high.");
  if (offHoursMultiplier > 1) warnings.push("Pre-market or after-hours liquidity penalty applied.");
  if (qualityGrade === "D" || qualityGrade === "F") warnings.push("Execution quality is too weak for an automatic market order.");

  return {
    side: input.side,
    requestedPrice: money(input.referencePrice),
    requestedQuantity,
    filledQuantity,
    partialFill,
    fillPrice: money(fillPrice),
    estimatedBid: money(estimatedBid),
    estimatedAsk: money(estimatedAsk),
    spreadBps: money(spreadBps),
    slippageBps: money(slippageBps),
    totalExecutionBps: money(totalExecutionBps),
    slippageAmount: money(slippageAmount),
    fee: money(fee),
    latencyMs,
    participationRate: money(participationRate),
    qualityGrade,
    modelVersion: "professional-fill-v1",
    warnings
  };
}
