import { FileText, Play, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentedReportCard } from "../components/DocumentedReportCard";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { SafetyBadge, ScoreBadge } from "../components/Badges";
import { api } from "../lib/api";
import { dateShort, percent, usd } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { DocumentedInvestmentReport, MarketScan } from "../lib/types";

export function ReportsCenterPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [scan, setScan] = useState<MarketScan | null>(null);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [report, setReport] = useState<DocumentedInvestmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const latest = await api.latestScan(marketMode);
    const next = latest?.signals.length ? latest : await api.runScan({ market: marketMode });
    setScan(next);
    setSelectedTicker(next?.signals[0]?.ticker ?? "");
    setReport(null);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  async function refreshScan() {
    setNotice("");
    const next = await api.runScan({ market: marketMode });
    setScan(next);
    setSelectedTicker(next.signals[0]?.ticker ?? "");
    setReport(null);
  }

  async function generate() {
    if (!selectedTicker) return;
    setGenerating(true);
    setNotice("");
    try {
      const next = await api.documentedReport(selectedTicker, marketMode);
      setReport(next);
      setNotice(`${selectedTicker} documented report generated.`);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />;

  const selectedSignal = scan?.signals.find((signal) => signal.ticker === selectedTicker);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Documented studies</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Reports Center</h2>
          <p className="mt-1 text-sm text-stone-400">
            {scan?.scanDate ? `${marketLabel} scan from ${dateShort(scan.scanDate)}` : `${marketLabel} scan pending`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label="Paper trading only" tone="green" />
          <SafetyBadge label="No guaranteed profit" tone="amber" />
        </div>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 space-y-2 text-sm text-stone-300">
            <span>Opportunity</span>
            <select
              className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
              value={selectedTicker}
              onChange={(event) => {
                setSelectedTicker(event.target.value);
                setReport(null);
              }}
            >
              {(scan?.signals ?? []).slice(0, 20).map((signal) => (
                <option key={signal.id} value={signal.ticker}>
                  {signal.ticker} - {signal.signalType} - score {signal.score}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6"
            onClick={refreshScan}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh Scan
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
            onClick={generate}
            disabled={!selectedTicker || generating}
          >
            <Play className="h-4 w-4" />
            {generating ? "Generating..." : "Generate Report"}
          </button>
        </div>

        {selectedSignal ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Score</p>
              <div className="mt-2">
                <ScoreBadge score={selectedSignal.score} />
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Price</p>
              <p className="mt-2 font-semibold text-stone-100">{usd.format(selectedSignal.price)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Daily move</p>
              <p className={selectedSignal.dailyChangePercent >= 0 ? "mt-2 font-semibold text-mint" : "mt-2 font-semibold text-danger"}>
                {percent(selectedSignal.dailyChangePercent)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Relative volume</p>
              <p className="mt-2 font-semibold text-stone-100">{selectedSignal.relativeVolume.toFixed(2)}x</p>
            </div>
          </div>
        ) : null}
      </section>

      {report ? (
        <DocumentedReportCard report={report} />
      ) : (
        <EmptyState icon={FileText} title="No documented report selected" description="Choose an opportunity and generate a report." />
      )}
    </div>
  );
}
