import { AlertTriangle, CalendarDays, ShieldAlert, TrendingUp } from "lucide-react";
import { SafetyBadge } from "./Badges";
import type { MarketBriefing, NoTradeStatus, RiskStatus } from "../lib/types";
import { usd } from "../lib/format";

export function DailyBriefingCard({ briefing }: { briefing: MarketBriefing }) {
  return (
    <section className="rounded-lg border border-mint/20 bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-stone-100">
          <CalendarDays className="h-5 w-5 text-mint" />
          <h3 className="text-lg font-semibold">Daily Briefing</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label={briefing.marketMood} tone={briefing.marketRegime === "risk-off" ? "red" : briefing.marketRegime === "high volatility" ? "amber" : "green"} />
          <SafetyBadge label={briefing.marketRegime} tone="neutral" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Best opportunities</p>
          <p className="mt-2 text-sm font-semibold text-stone-100">{briefing.bestOpportunities.join(", ") || "Waiting"}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Risks today</p>
          <p className="mt-2 text-sm text-stone-300">{briefing.risksToday[0] ?? "No major risk warning."}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Leaders</p>
          <p className="mt-2 text-sm font-semibold text-stone-100">
            {briefing.topGainers?.slice(0, 3).map((item) => item.ticker).join(", ") ??
              briefing.strongestCryptoNarratives?.slice(0, 2).map((item) => item.name).join(", ") ??
              "Collecting"}
          </p>
        </div>
      </div>
      {briefing.noTradeWarning ? (
        <div className="mt-4 rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm font-semibold text-red-100">
          {briefing.noTradeWarning}
        </div>
      ) : null}
    </section>
  );
}

export function NoTradePanel({ status }: { status: NoTradeStatus }) {
  return (
    <section className={`rounded-lg border p-5 shadow-glow ${status.noTradeToday ? "border-caution/25 bg-caution/10" : "border-line bg-panel/88"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={status.noTradeToday ? "h-5 w-5 text-caution" : "h-5 w-5 text-mint"} />
          <h3 className={status.noTradeToday ? "text-lg font-semibold text-amber-100" : "text-lg font-semibold text-stone-50"}>{status.headline}</h3>
        </div>
        <SafetyBadge label={status.noTradeToday ? "NO TRADE" : "SELECTIVE"} tone={status.noTradeToday ? "amber" : "green"} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {status.reasons.slice(0, 5).map((reason) => (
          <span key={reason} className="rounded-full border border-line bg-black/10 px-3 py-1 text-xs text-stone-200">
            {reason}
          </span>
        ))}
      </div>
      {status.bestRejectedCandidates.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {status.bestRejectedCandidates.slice(0, 2).map((candidate) => (
            <div key={candidate.ticker} className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="font-semibold text-stone-100">{candidate.ticker} rejected</p>
              <p className="mt-1 text-xs text-stone-500">{candidate.conditionNeeded}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function RiskStatePanel({ status }: { status: RiskStatus }) {
  const tone = status.state === "LOCKED" || status.state === "PAUSED" ? "red" : status.state === "REDUCED_SIZE" || status.state === "CAUTION" ? "amber" : "green";

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-stone-100">
          <ShieldAlert className="h-5 w-5 text-mint" />
          <h3 className="text-lg font-semibold">Risk State</h3>
        </div>
        <SafetyBadge label={status.state} tone={tone} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-xs text-stone-500">Daily P/L</p><p className="mt-1 font-semibold text-stone-100">{usd.format(status.dailyPl)}</p></div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-xs text-stone-500">Weekly P/L</p><p className="mt-1 font-semibold text-stone-100">{usd.format(status.weeklyPl)}</p></div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-xs text-stone-500">Open trades</p><p className="mt-1 font-semibold text-stone-100">{status.openTrades}</p></div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-stone-400">
        <TrendingUp className="h-4 w-4" />
        {status.reasons[0]}
      </p>
    </section>
  );
}
