import { AlertTriangle, BarChart3, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { SafetyBadge } from "./Badges";

type ScorePart = {
  label: string;
  score: number;
  max: number;
  detail?: string;
};

type ChecklistItem = {
  label: string;
  passed: boolean;
  detail?: string;
};

type StrategyProof = {
  strategyName?: string;
  status?: string;
  backtestTrades?: number;
  paperTrades?: number;
  winRate?: number;
  profitFactor?: number;
  maxDrawdown?: number;
  summary?: string;
};

type Evidence = {
  dataSource?: string;
  catalystSource?: string;
  priceDataSource?: string;
  researchProvider?: string;
  aiProviderUsed?: string;
  confidenceQuality?: string;
  researchQuality?: string;
  lastUpdated?: string;
  limitations?: string[];
};

type TrendBreakoutSetup = {
  score?: number;
  status?: string;
  actionable?: boolean;
  confirmations?: string[];
  blockingReasons?: string[];
  metrics?: {
    breakoutLevel?: number;
    breakoutPercent?: number;
    volumeRatio?: number;
    volumeBasis?: string;
    relativeStrength60d?: number;
    atrPercent?: number;
    rsi14?: number;
    extensionAtr?: number;
    intradayVwap?: number;
    intradayAboveVwap?: boolean;
    hourlyTrendBullish?: boolean;
  };
  riskPlan?: {
    entryTrigger?: number;
    maxEntryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    riskReward?: number;
  };
};

type ProfessionalPayload = {
  professional?: ProfessionalPayload;
  timeframe?: {
    alignment?: string;
    score?: number;
    warning?: string | null;
    dailyTrend?: string;
  };
  execution?: {
    executionGrade?: string;
    entryQuality?: number;
    chaseRisk?: string;
    warnings?: string[];
    blocked?: boolean;
  };
  riskState?: {
    state?: string;
    reasons?: string[];
  };
  checklist?: ChecklistItem[] | { result?: string; blocked?: boolean; items?: ChecklistItem[] };
  scoreBreakdown?: ScorePart[];
  noTradeReasons?: string[];
  strategyProof?: StrategyProof;
  evidence?: Evidence;
  researchQuality?: string;
  strategy?: { name?: string; status?: string };
  strategySetup?: TrendBreakoutSetup;
};

type ProfessionalPanelProps = {
  scoreBreakdownJson?: string | null;
  checklistJson?: string | null;
  noTradeReasonsJson?: string | null;
  strategyProofJson?: string | null;
  evidenceJson?: string | null;
  professionalJson?: string | null;
  researchQuality?: string | null;
  aiMode?: string | null;
  strategyName?: string | null;
  strategyStatus?: string | null;
};

function parseJson<T>(value?: string | null, fallback?: T): T | undefined {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function qualityTone(value?: string | null): "green" | "amber" | "red" | "purple" | "neutral" {
  if (value?.includes("HIGH")) return "green";
  if (value?.includes("MEDIUM")) return "purple";
  if (value?.includes("LOW")) return "red";
  if (value?.includes("LIMITED")) return "amber";
  return "neutral";
}

export function ProfessionalPanels(props: ProfessionalPanelProps) {
  const payload = parseJson<ProfessionalPayload>(props.professionalJson, {});
  const professional = payload?.professional ?? payload;
  const checklistPayload = professional?.checklist ?? payload?.checklist;
  const scoreBreakdown = parseJson<ScorePart[]>(props.scoreBreakdownJson, professional?.scoreBreakdown ?? []) ?? [];
  const checklist =
    parseJson<ChecklistItem[]>(props.checklistJson, Array.isArray(checklistPayload) ? checklistPayload : checklistPayload?.items ?? []) ?? [];
  const noTradeReasons = parseJson<string[]>(props.noTradeReasonsJson, professional?.noTradeReasons ?? []) ?? [];
  const strategyProof = parseJson<StrategyProof>(props.strategyProofJson, professional?.strategyProof ?? {}) ?? {};
  const evidence = parseJson<Evidence>(props.evidenceJson, professional?.evidence ?? {}) ?? {};
  const quality = props.researchQuality ?? professional?.researchQuality ?? evidence.researchQuality ?? "LIMITED";
  const strategyName = props.strategyName ?? professional?.strategy?.name ?? strategyProof.strategyName ?? "Unclassified";
  const strategyStatus = props.strategyStatus ?? professional?.strategy?.status ?? strategyProof.status ?? "NEW";
  const timeframe = payload?.timeframe;
  const execution = payload?.execution;
  const riskState = payload?.riskState;
  const strategySetup = professional?.strategySetup;
  const total = scoreBreakdown.reduce((sum, item) => sum + item.score, 0);
  const totalMax = scoreBreakdown.reduce((sum, item) => sum + item.max, 0) || 100;

  if (!scoreBreakdown.length && !checklist.length && !noTradeReasons.length && !Object.keys(evidence).length && !strategySetup) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {scoreBreakdown.length ? (
        <section className="rounded-lg border border-line bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-stone-100">
              <BarChart3 className="h-5 w-5 text-mint" />
              <h4 className="font-semibold">Professional Score Breakdown</h4>
            </div>
            <SafetyBadge label={`${total}/${totalMax}`} tone={total >= 85 ? "green" : total >= 70 ? "purple" : "amber"} />
          </div>
          <div className="mt-4 space-y-3">
            {scoreBreakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-stone-200">{item.label}</span>
                  <span className="text-stone-400">{item.score}/{item.max}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, (item.score / item.max) * 100)}%` }} />
                </div>
                {item.detail ? <p className="mt-1 text-xs leading-5 text-stone-500">{item.detail}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {strategySetup ? (
        <section className="rounded-lg border border-line bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-stone-100">
              <BarChart3 className="h-5 w-5 text-mint" />
              <h4 className="font-semibold">Trend Breakout V2 Setup</h4>
            </div>
            <SafetyBadge
              label={`${strategySetup.status ?? "UNKNOWN"} · ${strategySetup.score ?? 0}/100`}
              tone={strategySetup.actionable ? "green" : (strategySetup.score ?? 0) >= 70 ? "purple" : "amber"}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">20-day breakout</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.metrics?.breakoutPercent ?? 0}% · {strategySetup.metrics?.breakoutLevel ?? 0}</p></div>
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Volume confirmation</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.metrics?.volumeRatio ?? 0}x · {strategySetup.metrics?.volumeBasis ?? "volume"}</p></div>
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Relative strength</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.metrics?.relativeStrength60d ?? 0}% vs SPY</p></div>
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">ATR / RSI</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.metrics?.atrPercent ?? 0}% · {strategySetup.metrics?.rsi14 ?? 0}</p></div>
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Valid entry zone</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.riskPlan?.entryTrigger ?? 0}–{strategySetup.riskPlan?.maxEntryPrice ?? 0}</p></div>
            <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Stop / target</p><p className="mt-1 font-semibold text-stone-100">{strategySetup.riskPlan?.stopLoss ?? 0} / {strategySetup.riskPlan?.takeProfit ?? 0}</p></div>
          </div>
          {strategySetup.blockingReasons?.length ? (
            <p className="mt-3 text-xs leading-5 text-amber-100">{strategySetup.blockingReasons.slice(0, 3).join(" ")}</p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-stone-500">VWAP and hourly trend confirmation: {strategySetup.metrics?.intradayAboveVwap && strategySetup.metrics?.hourlyTrendBullish ? "passed" : "not yet confirmed"}. Initial target is {strategySetup.riskPlan?.riskReward ?? 0}R.</p>
          )}
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-stone-100">
            <Database className="h-5 w-5 text-purple-200" />
            <h4 className="font-semibold">Research Quality</h4>
          </div>
          <SafetyBadge label={quality} tone={qualityTone(quality)} />
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-stone-500">AI mode</span><span className="font-semibold text-stone-100">{props.aiMode ?? "TECHNICAL_ONLY"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-stone-500">AI provider used</span><span className="font-semibold text-stone-100">{evidence.aiProviderUsed ?? "none"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-stone-500">Price source</span><span className="font-semibold text-stone-100">{evidence.priceDataSource ?? "Unknown"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-stone-500">Catalyst source</span><span className="font-semibold text-stone-100">{evidence.catalystSource ?? "Unknown"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-stone-500">Research provider</span><span className="font-semibold text-stone-100">{evidence.researchProvider ?? "TradePilot rules"}</span></div>
        </div>
        {evidence.limitations?.length ? (
          <div className="mt-4 rounded-lg border border-caution/20 bg-caution/10 p-3 text-xs leading-5 text-amber-100">
            {evidence.limitations.slice(0, 3).join(" ")}
          </div>
        ) : null}
      </section>

      {checklist.length ? (
        <section className="rounded-lg border border-line bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-stone-100">
            <CheckCircle2 className="h-5 w-5 text-mint" />
            <h4 className="font-semibold">Professional Checklist</h4>
          </div>
          <div className="mt-4 space-y-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex gap-3 rounded-lg border border-line bg-black/10 p-3">
                <span className={item.passed ? "mt-0.5 h-2.5 w-2.5 rounded-full bg-mint" : "mt-0.5 h-2.5 w-2.5 rounded-full bg-caution"} />
                <div>
                  <p className="text-sm font-semibold text-stone-100">{item.label}</p>
                  {item.detail ? <p className="mt-1 text-xs leading-5 text-stone-500">{item.detail}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {timeframe || execution || riskState ? (
        <section className="rounded-lg border border-line bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-stone-100">
            <ShieldCheck className="h-5 w-5 text-purple-200" />
            <h4 className="font-semibold">Execution And Risk State</h4>
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            {timeframe ? (
              <div className="flex justify-between gap-3"><span className="text-stone-500">Timeframe alignment</span><span className="font-semibold text-stone-100">{timeframe.alignment ?? "Unknown"} · {timeframe.score ?? 0}</span></div>
            ) : null}
            {execution ? (
              <div className="flex justify-between gap-3"><span className="text-stone-500">Execution grade</span><span className="font-semibold text-stone-100">{execution.executionGrade ?? "N/A"} · {execution.entryQuality ?? 0}</span></div>
            ) : null}
            {riskState ? (
              <div className="flex justify-between gap-3"><span className="text-stone-500">Risk state</span><span className="font-semibold text-stone-100">{riskState.state ?? "NORMAL"}</span></div>
            ) : null}
          </div>
          {[timeframe?.warning, ...(execution?.warnings ?? []), ...(riskState?.reasons ?? [])].filter(Boolean).length ? (
            <p className="mt-3 text-xs leading-5 text-stone-500">
              {[timeframe?.warning, ...(execution?.warnings ?? []), ...(riskState?.reasons ?? [])].filter(Boolean).slice(0, 4).join(" ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-stone-100">
            <ShieldCheck className="h-5 w-5 text-mint" />
            <h4 className="font-semibold">Strategy Proof</h4>
          </div>
          <SafetyBadge label={strategyStatus} tone={strategyStatus === "PROVEN" ? "green" : strategyStatus === "TESTING" ? "purple" : strategyStatus === "NEW" ? "amber" : "red"} />
        </div>
        <p className="mt-3 text-sm font-semibold text-stone-100">{strategyName}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Backtest trades</p><p className="mt-1 font-semibold text-stone-100">{strategyProof.backtestTrades ?? 0}</p></div>
          <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Paper trades</p><p className="mt-1 font-semibold text-stone-100">{strategyProof.paperTrades ?? 0}</p></div>
          <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Win rate</p><p className="mt-1 font-semibold text-stone-100">{(strategyProof.winRate ?? 0).toFixed(1)}%</p></div>
          <div className="rounded-lg border border-line bg-black/10 p-3"><p className="text-stone-500">Profit factor</p><p className="mt-1 font-semibold text-stone-100">{(strategyProof.profitFactor ?? 0).toFixed(2)}</p></div>
        </div>
        {strategyProof.summary ? <p className="mt-3 text-xs leading-5 text-stone-500">{strategyProof.summary}</p> : null}
      </section>

      {noTradeReasons.length ? (
        <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-5 w-5" />
            <h4 className="font-semibold">No-Trade Reasons</h4>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {noTradeReasons.slice(0, 8).map((reason) => (
              <span key={reason} className="rounded-full border border-caution/25 bg-black/10 px-3 py-1 text-xs text-amber-100">
                {reason}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-amber-100">No trade is a valid professional decision.</p>
        </section>
      ) : null}
    </div>
  );
}
