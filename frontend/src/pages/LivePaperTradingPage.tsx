import { Activity, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountValueCard } from "../components/account/AccountValueCard";
import { SafetyBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { AssetLogo } from "../components/assets/AssetLogo";
import { TradeChart } from "../components/charts/TradeChart";
import { NewsImpactCard } from "../components/news/NewsImpactCard";
import { ExecutionQualityPanel } from "../components/trading/ExecutionQualityPanel";
import { OpenPositionsTable } from "../components/trading/OpenPositionsTable";
import { ProfessionalChecklist } from "../components/trading/ProfessionalChecklist";
import { RiskStatusPanel } from "../components/trading/RiskStatusPanel";
import { TradeActivityFeed } from "../components/trading/TradeActivityFeed";
import { api } from "../lib/api";
import { percent, usd } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { AssetDashboard, NewsScanResult, PaperAccountSummary, RiskStatus, Stock } from "../lib/types";

export function LivePaperTradingPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const assetType = marketMode === "crypto" ? "crypto" : "stock";
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [summary, setSummary] = useState<PaperAccountSummary | null>(null);
  const [risk, setRisk] = useState<RiskStatus | null>(null);
  const [news, setNews] = useState<NewsScanResult | null>(null);
  const [selected, setSelected] = useState("");
  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    const [nextDashboard, nextSummary, nextRisk, nextNews] = await Promise.all([
      api.dashboard(marketMode),
      api.paperAccount(marketMode),
      api.riskStatus(marketMode),
      api.latestNews(marketMode, 12)
    ]);
    setDashboard(nextDashboard);
    setSummary(nextSummary);
    setRisk(nextRisk);
    setNews(nextNews);
    const first = selected || nextDashboard.bestCandidate?.ticker || nextDashboard.scan?.signals[0]?.ticker || nextSummary.openPositions[0]?.symbol || "";
    setSelected(first);
    if (first) setStock(await api.stock(first, marketMode));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  useEffect(() => {
    if (!selected) return;
    api.stock(selected, marketMode).then(setStock).catch(() => undefined);
  }, [selected, marketMode]);

  const signals = dashboard?.scan?.signals ?? [];
  const selectedSignal = useMemo(() => signals.find((signal) => signal.ticker === selected), [signals, selected]);
  const selectedNews = news?.items.filter((item) => item.symbol === selected).slice(0, 3) ?? [];

  async function createPlan() {
    if (!selected) return;
    const plan = await api.createTradePlan(selected, marketMode);
    setNotice(`Trade plan created: ${plan.status}. Risk engine remains required before paper execution.`);
  }

  async function closePosition(positionId: string) {
    const position = summary?.openPositions.find((item) => item.id === positionId);
    if (!position?.sourcePaperTradeId) return;
    await api.closePaperTrade(position.sourcePaperTradeId, { status: "manual_close" });
    await load();
  }

  if (loading || !dashboard || !summary) return <LoadingSkeleton rows={8} />;

  return (
    <div className="space-y-5">
      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Live terminal</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Paper-Trading Terminal</h2>
          <p className="mt-1 text-sm text-stone-400">Exchange-style monitoring for paper trades only. Real trading is disabled.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6" onClick={load}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <AccountValueCard account={summary.account} />

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="space-y-3 rounded-lg border border-line bg-panel/88 p-3 shadow-glow">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-50">Asset List</h3>
            <SafetyBadge label="AUTO SCAN" tone="green" />
          </div>
          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {signals.length ? signals.slice(0, 18).map((signal) => (
              <button
                key={signal.id}
                className={`w-full rounded-lg border p-3 text-left transition ${selected === signal.ticker ? "border-caution bg-caution/10" : "border-line bg-white/[0.03] hover:bg-white/[0.06]"}`}
                onClick={() => setSelected(signal.ticker)}
              >
                <div className="flex items-center gap-3">
                  <AssetLogo assetType={assetType} symbol={signal.ticker} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-50">{signal.ticker}</p>
                    <p className="truncate text-xs text-stone-500">{signal.signalType}</p>
                  </div>
                  <span className="rounded bg-mint/10 px-2 py-1 text-xs font-semibold text-mint">{signal.score}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span>{usd.format(signal.price)}</span>
                  <span className={signal.dailyChangePercent >= 0 ? "text-mint" : "text-danger"}>{percent(signal.dailyChangePercent)}</span>
                </div>
              </button>
            )) : <EmptyState icon={Activity} title="No scan yet" description="Run a market scan to populate terminal assets." />}
          </div>
        </aside>

        <main className="space-y-5">
          {stock ? <TradeChart stock={stock} marketMode={marketMode} /> : <EmptyState icon={Activity} title="No asset selected" description="Select an asset to load the professional chart." />}
          {summary.openPositions.length ? (
            <OpenPositionsTable
              positions={summary.openPositions}
              currency={summary.account.currency}
              onClose={(position) => closePosition(position.id)}
            />
          ) : null}
          <TradeActivityFeed events={summary.activityFeed} />
        </main>

        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-stone-50">{selected || "No asset"}</h3>
                <p className="text-sm text-stone-400">Paper execution panel</p>
              </div>
              <SafetyBadge label="REAL OFF" tone="red" />
            </div>
            <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-caution px-4 text-sm font-semibold text-ink hover:bg-caution/90" onClick={createPlan} disabled={!selected}>
              <Plus className="h-4 w-4" />
              Create Paper Plan
            </button>
            <p className="mt-3 text-xs leading-5 text-stone-500">Plans can open automatically only after checklist, execution, account cash, no-trade, and risk approval.</p>
          </section>
          <RiskStatusPanel risk={risk} />
          <ExecutionQualityPanel professionalJson={selectedSignal?.strategyProofJson} />
          <ProfessionalChecklist checklistJson={selectedSignal?.checklistJson} />
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-stone-50">News Affecting Asset</h3>
            {selectedNews.length ? selectedNews.map((item) => <NewsImpactCard key={item.id} item={item} />) : <p className="rounded-lg border border-line bg-panel/88 p-4 text-sm text-stone-400">No current news catalyst found for {selected || "this asset"}.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
