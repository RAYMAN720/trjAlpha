import { ClipboardList, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { WatchlistItem } from "../lib/types";
import { DecisionBadge, RiskBadge, ScoreBadge } from "./Badges";
import { dateShort } from "../lib/format";
import { assetDetailRoute, useMarketMode } from "../lib/marketMode";

export function WatchlistTable({
  items,
  onRemove,
  onCreatePlan
}: {
  items: WatchlistItem[];
  onRemove?: (item: WatchlistItem) => void;
  onCreatePlan?: (item: WatchlistItem) => void;
}) {
  const { marketMode } = useMarketMode();
  const isCrypto = marketMode === "crypto";

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-4 py-3">{isCrypto ? "Symbol" : "Ticker"}</th>
            <th className="px-4 py-3">{isCrypto ? "Asset" : "Company"}</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Last Scan</th>
            <th className="px-4 py-3">Alert</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-4 font-semibold text-stone-50">{item.ticker}</td>
              <td className="px-4 py-4 text-stone-300">{item.companyName}</td>
              <td className="px-4 py-4">
                <ScoreBadge score={item.score} />
              </td>
              <td className="px-4 py-4">
                <RiskBadge risk={item.riskLevel} />
              </td>
              <td className="px-4 py-4">
                <DecisionBadge decision={item.decision} />
              </td>
              <td className="px-4 py-4 text-stone-400">{dateShort(item.createdAt)}</td>
              <td className="px-4 py-4 text-caution">Manual</td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={assetDetailRoute(marketMode, item.ticker)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-stone-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </Link>
                  {onCreatePlan ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs text-mint"
                      onClick={() => onCreatePlan(item)}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Plan
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs text-red-200"
                      onClick={() => onRemove(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
