import { ClipboardList, Microscope, Plus, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { percent, usd } from "../lib/format";
import { assetDetailRoute, useMarketMode } from "../lib/marketMode";
import type { MarketSignal } from "../lib/types";
import { DecisionBadge, RiskBadge, SafetyBadge, ScoreBadge } from "./Badges";
import { AssetLogo } from "./assets/AssetLogo";

type SignalTableProps = {
  signals: MarketSignal[];
  onAddWatchlist?: (signal: MarketSignal) => void;
  onCreatePlan?: (signal: MarketSignal) => void;
  compact?: boolean;
};

function analysisBadge(signal: MarketSignal) {
  const analysis = signal.analysis;
  if (!analysis) return <SafetyBadge label="Pending" tone="neutral" />;
  if (analysis.technicalOnly) return <SafetyBadge label="Technical only" tone="amber" />;
  if (analysis.provider === "mistral") return <SafetyBadge label="Mistral fallback" tone="purple" />;
  return <SafetyBadge label="OpenAI" tone="green" />;
}

export function SignalTable({ signals, onAddWatchlist, onCreatePlan, compact = false }: SignalTableProps) {
  const { marketMode } = useMarketMode();
  const isCrypto = marketMode === "crypto";

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin">
      <table className="min-w-[1320px] w-full text-left text-sm">
        <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">{isCrypto ? "Symbol" : "Ticker"}</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">{isCrypto ? "24h %" : "Daily %"}</th>
            <th className="px-4 py-3">{isCrypto ? "24h Rel Vol" : "Rel Vol"}</th>
            <th className="px-4 py-3">Signal</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Risk</th>
            {!compact ? <th className="px-4 py-3">Quality</th> : null}
            {!compact ? <th className="px-4 py-3">Strategy</th> : null}
            {!compact ? <th className="px-4 py-3">Analysis</th> : null}
            {!compact ? <th className="px-4 py-3">Decision</th> : null}
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {signals.map((signal, index) => (
            <tr key={signal.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-4 text-stone-400">{index + 1}</td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <AssetLogo assetType={signal.assetType ?? (isCrypto ? "crypto" : "stock")} symbol={signal.ticker} size="sm" />
                  <Link to={assetDetailRoute(marketMode, signal.ticker)} className="font-semibold text-stone-50 hover:text-mint">
                    {signal.ticker}
                  </Link>
                </div>
              </td>
              <td className="px-4 py-4 text-stone-200">{usd.format(signal.price)}</td>
              <td className={`px-4 py-4 font-semibold ${signal.dailyChangePercent >= 0 ? "text-mint" : "text-danger"}`}>
                {percent(signal.dailyChangePercent)}
              </td>
              <td className="px-4 py-4 text-stone-200">{signal.relativeVolume.toFixed(2)}x</td>
              <td className="px-4 py-4 text-stone-300">{signal.signalType}</td>
              <td className="px-4 py-4">
                <ScoreBadge score={signal.score} />
              </td>
              <td className="px-4 py-4">
                <RiskBadge risk={signal.riskLevel} />
              </td>
              {!compact ? (
                <td className="px-4 py-4">
                  <SafetyBadge
                    label={signal.researchQuality ?? "LIMITED"}
                    tone={(signal.researchQuality ?? "").includes("LOW") ? "red" : (signal.researchQuality ?? "").includes("LIMITED") ? "amber" : "purple"}
                  />
                </td>
              ) : null}
              {!compact ? (
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <SafetyBadge
                      label={signal.strategyStatus ?? "NEW"}
                      tone={signal.strategyStatus === "PROVEN" ? "green" : signal.strategyStatus === "TESTING" ? "purple" : signal.strategyStatus === "NEW" ? "amber" : "red"}
                    />
                    <p className="max-w-44 truncate text-xs text-stone-500">{signal.strategyName ?? "Unclassified"}</p>
                  </div>
                </td>
              ) : null}
              {!compact ? (
                <td className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {analysisBadge(signal)}
                    {signal.analysis?.cached ? <SafetyBadge label="Cached" tone="neutral" /> : null}
                    {signal.analysis ? <span className="text-xs text-stone-500">{signal.analysis.confidence}%</span> : null}
                  </div>
                </td>
              ) : null}
              {!compact ? (
                <td className="px-4 py-4">
                  <DecisionBadge decision={signal.decision} />
                </td>
              ) : null}
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={assetDetailRoute(marketMode, signal.ticker)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-stone-200 hover:bg-white/6"
                  >
                    <Microscope className="h-4 w-4" />
                    Research
                  </Link>
                  {onAddWatchlist ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-stone-200 hover:bg-white/6"
                      onClick={() => onAddWatchlist(signal)}
                    >
                      <Star className="h-4 w-4" />
                      Watch
                    </button>
                  ) : null}
                  {onCreatePlan ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint hover:bg-mint/15"
                      onClick={() => onCreatePlan(signal)}
                    >
                      <Plus className="h-4 w-4" />
                      Plan
                    </button>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-stone-500">
                      <ClipboardList className="h-4 w-4" />
                      Paper
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
