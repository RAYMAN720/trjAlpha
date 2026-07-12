import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PortfolioOverview } from "../components/portfolio/PortfolioOverview";
import { api } from "../lib/api";
import { useMarketMode } from "../lib/marketMode";
import type { PaperAccountSummary, PaperPosition } from "../lib/types";

export function PortfolioPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [summary, setSummary] = useState<PaperAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setSummary(await api.paperAccount(marketMode));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  async function closePosition(position: PaperPosition) {
    if (!position.sourcePaperTradeId) return;
    await api.closePaperTrade(position.sourcePaperTradeId, { status: "manual_close" });
    await load();
  }

  if (loading || !summary) return <LoadingSkeleton rows={8} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Portfolio</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Paper Portfolio</h2>
          <p className="mt-1 text-sm text-stone-400">Account value moves from cash, open positions, realized P/L, and unrealized P/L.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6" onClick={load}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      <PortfolioOverview summary={summary} onClosePosition={closePosition} />
    </div>
  );
}
