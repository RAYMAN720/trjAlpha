import { Filter, Play, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";
import type { MarketScan, MarketSignal } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { SignalTable } from "../components/SignalTable";
import { useMarketMode } from "../lib/marketMode";

type Filters = {
  minPrice: number;
  maxPrice: number;
  minMarketCap: number;
  minVolume: number;
  minRelativeVolume: number;
  minScore: number;
  excludePennyStocks: boolean;
  excludeLowLiquidity: boolean;
};

const stockFilters: Filters = {
  minPrice: 2,
  maxPrice: 10000,
  minMarketCap: 300000000,
  minVolume: 1000000,
  minRelativeVolume: 1.5,
  minScore: 0,
  excludePennyStocks: true,
  excludeLowLiquidity: true
};

const cryptoFilters: Filters = {
  minPrice: 0.0001,
  maxPrice: 1000000,
  minMarketCap: 100000000,
  minVolume: 5000000,
  minRelativeVolume: 0.5,
  minScore: 0,
  excludePennyStocks: false,
  excludeLowLiquidity: true
};

export function ScannerPage() {
  const { marketMode, marketLabel, assetLabel } = useMarketMode();
  const [filters, setFilters] = useState(marketMode === "crypto" ? cryptoFilters : stockFilters);
  const [scan, setScan] = useState<MarketScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);

  function applyScan(next: MarketScan | null) {
    setScan(next);
    setLiveUpdatedAt(next?.scanDate ?? null);
  }

  useEffect(() => {
    setLoading(true);
    const nextFilters = marketMode === "crypto" ? cryptoFilters : stockFilters;
    setFilters(nextFilters);

    api
      .runScan({ ...nextFilters, market: marketMode })
      .then(applyScan)
      .catch(() => applyScan(null))
      .finally(() => setLoading(false));
  }, [marketMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      api
        .runScan({ ...filters, market: marketMode })
        .then(applyScan)
        .catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [marketMode, filters]);

  async function runScan() {
    setRunning(true);
    setNotice("");
    try {
      const next = await api.runScan({ ...filters, market: marketMode });
      applyScan(next);
      setNotice(`Scanned ${next.totalScanned} ${assetLabel} and ranked ${next.signals.length} candidates.`);
    } finally {
      setRunning(false);
    }
  }

  async function addWatchlist(signal: MarketSignal) {
    await api.addWatchlist(signal.ticker, {
      market: marketMode,
      score: signal.score,
      riskLevel: signal.riskLevel,
      decision: signal.decision
    });
    setNotice(`${signal.ticker} added to watchlist.`);
  }

  async function createPlan(signal: MarketSignal) {
    const plan = await api.createTradePlan(signal.ticker, marketMode);
    setNotice(`${signal.ticker} paper plan created with status: ${plan.status}.`);
  }

  if (loading) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">{marketLabel} scan</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Market Scanner</h2>
          {liveUpdatedAt ? (
            <p className="mt-1 text-sm text-stone-400">Live prices refreshed {dateShort(liveUpdatedAt)} and update every 5 seconds.</p>
          ) : null}
        </div>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
          onClick={runScan}
          disabled={running}
        >
          <Play className="h-4 w-4" />
          {running ? "Scanning..." : `Run ${marketLabel} Scan`}
        </button>
      </div>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="mb-4 flex items-center gap-2 text-stone-100">
          <SlidersHorizontal className="h-5 w-5 text-caution" />
          <h3 className="text-lg font-semibold">Filters</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Minimum price", "minPrice"],
            ["Maximum price", "maxPrice"],
            ["Minimum market cap", "minMarketCap"],
            ["Minimum volume", "minVolume"],
            ["Minimum relative volume", "minRelativeVolume"],
            ["Minimum AI score", "minScore"]
          ].map(([label, key]) => (
            <label key={key} className="space-y-2 text-sm text-stone-300">
              <span>{label}</span>
              <input
                type="number"
                className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                value={filters[key as keyof Filters] as number}
                onChange={(event) => setFilters((current) => ({ ...current, [key]: Number(event.target.value) }))}
              />
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={filters.excludePennyStocks}
              onChange={(event) => setFilters((current) => ({ ...current, excludePennyStocks: event.target.checked }))}
            />
            {marketMode === "crypto" ? "Exclude micro-cap tokens" : "Exclude penny stocks"}
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={filters.excludeLowLiquidity}
              onChange={(event) => setFilters((current) => ({ ...current, excludeLowLiquidity: event.target.checked }))}
            />
            Exclude low liquidity
          </label>
        </div>
      </section>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      {scan?.signals.length ? (
        <SignalTable signals={scan.signals} onAddWatchlist={addWatchlist} onCreatePlan={createPlan} />
      ) : (
        <EmptyState icon={Filter} title="No candidates match the filters" description={`Lower the score or liquidity filters, then run another ${marketLabel.toLowerCase()} scan.`} />
      )}
    </div>
  );
}
