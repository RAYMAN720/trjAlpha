import { Activity, AlertTriangle, BarChart3, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { dateShort, percent, usd } from "../lib/format";
import type { BacktestResult, PaperTradeEvent, RiskEvent, StrategyPerformance } from "../lib/types";

type StrategyPayload = {
  performance: StrategyPerformance[];
  events: PaperTradeEvent[];
  riskEvents: RiskEvent[];
  backtests: BacktestResult[];
};

export function StrategyPerformancePage() {
  const [payload, setPayload] = useState<StrategyPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .strategyPerformance()
      .then(setPayload)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!payload) return <EmptyState icon={BarChart3} title="No strategy data" description="Run dailyReviewJob to generate strategy performance." />;

  const primary = payload.performance[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Autonomous paper strategy</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">Strategy Performance</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trade count" value={primary?.tradeCount ?? 0} icon={Activity} tone="purple" />
        <StatCard label="Win rate" value={percent(primary?.winRate ?? 0).replace("+", "")} icon={BarChart3} tone="green" />
        <StatCard label="Profit factor" value={(primary?.profitFactor ?? 0).toFixed(2)} icon={BarChart3} tone="amber" />
        <StatCard label="Max drawdown" value={usd.format(primary?.maxDrawdown ?? 0)} icon={AlertTriangle} tone="red" />
      </div>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <h3 className="text-lg font-semibold text-stone-50">Paper trade events</h3>
        <div className="mt-4 space-y-3">
          {payload.events.map((event) => (
            <div key={event.id} className="rounded-lg border border-line bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-stone-100">{event.ticker} · {event.eventType}</p>
                <span className="text-xs text-stone-500">{dateShort(event.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-stone-400">{event.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex items-center gap-2 text-caution">
          <ShieldAlert className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Risk engine blocks</h3>
        </div>
        <div className="mt-4 space-y-3">
          {payload.riskEvents.map((event) => (
            <div key={event.id} className="rounded-lg border border-danger/20 bg-danger/10 p-3">
              <p className="font-semibold text-red-100">{event.ticker ?? "SYSTEM"} · {event.rule}</p>
              <p className="mt-2 text-sm text-red-100/80">{event.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <h3 className="text-lg font-semibold text-stone-50">Backtest results</h3>
        <div className="mt-4 space-y-3">
          {payload.backtests.map((result) => (
            <article key={result.id} className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="font-semibold text-stone-100">{result.strategyName}</p>
              <p className="mt-2 text-sm text-stone-400">{result.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
