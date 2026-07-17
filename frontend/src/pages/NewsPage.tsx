import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { SafetyBadge } from "../components/Badges";
import { NewsImpactCard } from "../components/news/NewsImpactCard";
import { api } from "../lib/api";
import { useMarketMode } from "../lib/marketMode";
import type { NewsScanResult, NewsStatus } from "../lib/types";

export function NewsPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [news, setNews] = useState<NewsScanResult | null>(null);
  const [status, setStatus] = useState<NewsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(scan = false) {
    const [nextNews, nextStatus] = await Promise.all([
      scan ? api.scanNews(marketMode) : api.latestNews(marketMode, 50),
      api.newsStatus()
    ]);
    setNews(nextNews);
    setStatus(nextStatus);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  if (loading) return <LoadingSkeleton rows={8} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">News intelligence</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} News Impact</h2>
          <p className="mt-1 text-sm text-stone-400">News can inform a setup, but it never creates a paper trade alone.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-caution px-4 text-sm font-semibold text-ink hover:bg-caution/90" onClick={() => load(true)}>
          <RefreshCcw className="h-4 w-4" />
          Scan News
        </button>
      </div>

      <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-sm text-amber-100">
        {status?.warning ?? "News must pass technical confirmation, volume, playbook, and risk checks before any paper-trade action."}
      </section>

      <div className="flex flex-wrap gap-2">
        <SafetyBadge label={`Provider: ${news?.provider ?? status?.provider ?? "unknown"}`} tone={news?.status === "ok" ? "green" : "amber"} />
        <SafetyBadge label={status?.aiAnalysisEnabled ? "AI OPTIONAL" : "TECHNICAL ONLY"} tone="purple" />
        <SafetyBadge label="PAPER ONLY" tone="green" />
      </div>

      {news?.warning ? <div className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-sm text-amber-100">{news.warning}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {news?.items.length ? (
          news.items.map((item) => <NewsImpactCard key={item.id} item={item} />)
        ) : (
          <div className="xl:col-span-2">
            <EmptyState icon={RefreshCcw} title="No news scan yet" description="Run the news scan to rank recent catalysts and risk warnings." />
          </div>
        )}
      </div>
    </div>
  );
}
