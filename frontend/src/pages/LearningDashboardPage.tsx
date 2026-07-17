import { BarChart3, Lightbulb, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { percent } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { LearningSummary } from "../lib/types";

export function LearningDashboardPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .learningSummary(marketMode)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [marketMode]);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!summary) return <EmptyState icon={Lightbulb} title="Learning data unavailable" description="Run dailyReviewJob to generate insights." />;

  const performance = summary.performance;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Prediction outcomes</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Learning Dashboard</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Win rate" value={percent(performance?.winRate ?? summary.winRate).replace("+", "")} icon={Percent} tone="green" />
        <StatCard label="Profit factor" value={(performance?.profitFactor ?? 0).toFixed(2)} icon={BarChart3} tone="purple" />
        <StatCard label="Average gain" value={`${summary.averageGain.toFixed(2)}%`} icon={TrendingUp} tone="green" />
        <StatCard label="Average loss" value={`${summary.averageLoss.toFixed(2)}%`} icon={TrendingDown} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">{marketMode === "crypto" ? "Best crypto assets" : "Best sectors"}</h3>
          <p className="mt-3 text-2xl font-semibold text-mint">{performance?.bestSector ?? "Collecting data"}</p>
          <p className="mt-2 text-sm text-stone-400">Best signal type: {performance?.bestSignalType ?? "Not enough data"}</p>
        </section>
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">{marketMode === "crypto" ? "Worst crypto assets" : "Worst sectors"}</h3>
          <p className="mt-3 text-2xl font-semibold text-danger">{performance?.worstSector ?? "Collecting data"}</p>
          <p className="mt-2 text-sm text-stone-400">Worst signal type: {performance?.worstSignalType ?? "Not enough data"}</p>
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-50">Latest learning insights</h3>
        {summary.insights.map((insight) => (
          <article key={insight.id} className="rounded-lg border border-berry/25 bg-berry/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="font-semibold text-purple-100">{insight.title}</h4>
              <span className="rounded-full border border-berry/30 px-3 py-1 text-xs text-purple-100">{insight.confidence}% confidence</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-purple-100/85">{insight.insight}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
