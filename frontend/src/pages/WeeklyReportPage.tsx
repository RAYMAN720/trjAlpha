import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SafetyBadge } from "../components/Badges";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import { usd } from "../lib/format";
import type { WeeklyTraderReport } from "../lib/types";

export function WeeklyReportPage() {
  const [report, setReport] = useState<WeeklyTraderReport | null>(null);

  useEffect(() => {
    api.weeklyTraderReport().then(setReport);
  }, []);

  if (!report) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Weekly report card</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Professional Trader Review</h2>
          <p className="mt-2 text-sm text-stone-400">{report.disclaimer}</p>
        </div>
        <ClipboardCheck className="h-7 w-7 text-mint" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-lg border border-line bg-panel/88 p-4"><p className="text-xs text-stone-500">Total trades</p><p className="mt-2 text-2xl font-semibold text-stone-50">{report.totalTrades}</p></section>
        <section className="rounded-lg border border-line bg-panel/88 p-4"><p className="text-xs text-stone-500">Win rate</p><p className="mt-2 text-2xl font-semibold text-stone-50">{report.winRate.toFixed(1)}%</p></section>
        <section className="rounded-lg border border-line bg-panel/88 p-4"><p className="text-xs text-stone-500">Profit factor</p><p className="mt-2 text-2xl font-semibold text-stone-50">{report.profitFactor.toFixed(2)}</p></section>
        <section className="rounded-lg border border-line bg-panel/88 p-4"><p className="text-xs text-stone-500">Paper P/L</p><p className={report.profitLoss >= 0 ? "mt-2 text-2xl font-semibold text-mint" : "mt-2 text-2xl font-semibold text-danger"}>{usd.format(report.profitLoss)}</p></section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Process Findings</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <p><span className="text-stone-500">Best setup:</span> <span className="text-stone-100">{report.bestSetup}</span></p>
            <p><span className="text-stone-500">Biggest mistake:</span> <span className="text-stone-100">{report.biggestMistake}</span></p>
            <p><span className="text-stone-500">No-trade decisions:</span> <span className="text-stone-100">{report.noTradeDecisions}</span></p>
            <p><span className="text-stone-500">Blocked risky trades:</span> <span className="text-stone-100">{report.blockedRiskyTrades}</span></p>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Recommendations For Next Week</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {report.recommendationsForNextWeek.map((item) => <SafetyBadge key={item} label={item} tone="neutral" />)}
          </div>
        </section>
      </div>
    </div>
  );
}
