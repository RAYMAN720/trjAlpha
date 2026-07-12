import { ShieldAlert } from "lucide-react";
import type { RiskStatus } from "../../lib/types";
import { SafetyBadge } from "../Badges";

export function RiskStatusPanel({ risk }: { risk?: RiskStatus | null }) {
  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-mint" />
          <h3 className="text-lg font-semibold text-stone-50">Risk Manager</h3>
        </div>
        {risk ? <SafetyBadge label={risk.state} tone={risk.tradePaused ? "red" : risk.state === "NORMAL" ? "green" : "amber"} /> : null}
      </div>
      {risk ? (
        <div className="mt-4 space-y-3 text-sm text-stone-300">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs text-stone-500">Daily P/L</p>
              <p className={risk.dailyPl >= 0 ? "mt-1 font-semibold text-mint" : "mt-1 font-semibold text-danger"}>{risk.dailyPl.toFixed(2)}</p>
              <p className="mt-1 text-[11px] text-stone-500">Limit {risk.dailyLossLimit.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs text-stone-500">Weekly P/L</p>
              <p className={risk.weeklyPl >= 0 ? "mt-1 font-semibold text-mint" : "mt-1 font-semibold text-danger"}>{risk.weeklyPl.toFixed(2)}</p>
              <p className="mt-1 text-[11px] text-stone-500">Limit {risk.weeklyLossLimit.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs text-stone-500">Trades today</p>
              <p className="mt-1 font-semibold text-stone-100">{risk.tradesOpenedToday}/{risk.maxDailyTrades}</p>
              <p className="mt-1 text-[11px] text-stone-500">Open now: {risk.openTrades}</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs text-stone-500">Drawdown</p>
              <p className={risk.currentDrawdownPercent >= risk.maxAccountDrawdownPercent * 0.75 ? "mt-1 font-semibold text-danger" : "mt-1 font-semibold text-stone-100"}>{risk.currentDrawdownPercent.toFixed(2)}%</p>
              <p className="mt-1 text-[11px] text-stone-500">Lock at {risk.maxAccountDrawdownPercent.toFixed(1)}%</p>
            </div>
          </div>
          <p className="text-xs text-stone-400">Consecutive losses: {risk.lossesInRow}/{risk.maxConsecutiveLosses}. Size multiplier: {risk.reducedSizeMultiplier.toFixed(2)}×.</p>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3 text-xs leading-5 text-stone-400">
            {risk.reasons?.join(" ")}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-stone-400">Risk status loading.</p>
      )}
    </section>
  );
}
