import { CheckCircle2, ShieldAlert } from "lucide-react";
import { usd } from "../lib/format";
import type { TradePlan } from "../lib/types";
import { ProfessionalPanels } from "./ProfessionalPanels";

export function TradePlanCard({
  plan,
  onApprove
}: {
  plan: TradePlan;
  onApprove?: (plan: TradePlan) => void;
}) {
  const metrics = [
    ["Entry", usd.format(plan.entryPrice)],
    ["Stop loss", usd.format(plan.stopLoss)],
    ["Take profit", usd.format(plan.takeProfit)],
    ["Quantity", plan.quantity.toString()],
    ["Position size", usd.format(plan.positionSize)],
    ["Max loss", usd.format(plan.maxLoss)],
    ["Risk/reward", `${plan.riskRewardRatio.toFixed(1)}:1`],
    ["Status", plan.status]
  ];

  return (
    <section className="rounded-lg border border-mint/25 bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-mint">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Trade Plan</h3>
          </div>
          <p className="mt-2 text-sm text-stone-400">This is a research-based paper trade plan, not a guaranteed prediction.</p>
        </div>
        {onApprove ? (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onApprove(plan)}
            disabled={plan.status === "Watchlist Only" || plan.quantity < 1}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve Paper Trade
          </button>
        ) : null}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-white/[0.03] p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</dt>
            <dd className="mt-2 text-sm font-semibold text-stone-100">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg border border-caution/20 bg-caution/10 p-4 text-sm leading-6 text-amber-100">{plan.reasoning}</p>

      <div className="mt-4">
        <ProfessionalPanels
          professionalJson={plan.professionalJson}
          researchQuality={plan.researchQuality}
          strategyName={plan.strategyName}
          strategyStatus={plan.strategyStatus}
        />
      </div>
    </section>
  );
}
