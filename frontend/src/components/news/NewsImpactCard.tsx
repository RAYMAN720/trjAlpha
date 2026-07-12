import { ExternalLink, Newspaper } from "lucide-react";
import { dateShort } from "../../lib/format";
import type { MarketNewsItem } from "../../lib/types";
import { SafetyBadge } from "../Badges";
import { AssetLogo } from "../assets/AssetLogo";
import { CatalystBadge } from "./CatalystBadge";

export function NewsImpactCard({ item }: { item: MarketNewsItem }) {
  const scoreClass = item.scoreImpact >= 0 ? "text-mint" : "text-danger";
  return (
    <article className="rounded-lg border border-line bg-panel/88 p-4 shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <AssetLogo assetType={item.assetType} symbol={item.symbol} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-stone-50">{item.symbol}</p>
              <CatalystBadge item={item} />
              <SafetyBadge label={item.dataQuality} tone={item.dataQuality === "NEWS CONFIRMED" ? "green" : "amber"} />
            </div>
            <h3 className="mt-2 text-sm font-semibold leading-5 text-stone-100">{item.title}</h3>
          </div>
        </div>
        <Newspaper className="h-5 w-5 shrink-0 text-stone-600" />
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-400">{item.summary}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Impact" value={item.impactLevel} />
        <Metric label="Decision" value={item.decision.replace(/_/g, " ")} />
        <Metric label="Score impact" value={`${item.scoreImpact >= 0 ? "+" : ""}${item.scoreImpact}`} className={scoreClass} />
      </div>
      <div className="mt-4 rounded-lg border border-caution/25 bg-caution/10 p-3 text-xs leading-5 text-amber-100">
        {item.riskWarning}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
        <span>{item.source} - {dateShort(item.publishedAt)}</span>
        <a className="inline-flex items-center gap-1 text-mint" href={item.url} target="_blank" rel="noreferrer">
          Source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

function Metric({ label, value, className = "text-stone-50" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className={`mt-2 text-sm font-semibold capitalize ${className}`}>{value}</p>
    </div>
  );
}
