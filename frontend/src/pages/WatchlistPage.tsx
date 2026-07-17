import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { WatchlistTable } from "../components/WatchlistTable";
import { api } from "../lib/api";
import { useMarketMode } from "../lib/marketMode";
import type { WatchlistItem } from "../lib/types";

export function WatchlistPage() {
  const { marketMode, marketLabel, assetLabel } = useMarketMode();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setItems(await api.watchlist(marketMode));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  async function remove(item: WatchlistItem) {
    await api.removeWatchlist(item.ticker, marketMode);
    setNotice(`${item.ticker} removed from watchlist.`);
    await load();
  }

  async function createPlan(item: WatchlistItem) {
    const plan = await api.createTradePlan(item.ticker, marketMode);
    setNotice(`${item.ticker} paper plan created with status: ${plan.status}.`);
  }

  if (loading) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Saved research targets</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Watchlist</h2>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      {items.length ? (
        <WatchlistTable items={items} onRemove={remove} onCreatePlan={createPlan} />
      ) : (
        <EmptyState icon={Star} title={`No saved ${assetLabel}`} description={`Add candidates from the ${marketLabel.toLowerCase()} scanner or research page.`} />
      )}
    </div>
  );
}
