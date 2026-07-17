import { CircleDollarSign, Eye } from "lucide-react";
import { percent, usd } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { PaperTrade } from "../lib/types";
import { AssetLogo } from "./assets/AssetLogo";
import { SafetyBadge } from "./Badges";

function analysisLabel(trade: PaperTrade) {
  const analysis = trade.analysis;
  if (!analysis) return "Not linked";
  if (analysis.technicalOnly) return "Technical only";
  if (analysis.provider === "mistral") return "Mistral fallback";
  if (analysis.provider === "openai") return "OpenAI";
  return analysis.provider;
}

function analysisTone(trade: PaperTrade): "green" | "amber" | "purple" | "neutral" {
  const analysis = trade.analysis;
  if (!analysis) return "neutral";
  if (analysis.technicalOnly) return "amber";
  if (analysis.provider === "openai") return "green";
  return "purple";
}

export function PaperTradeTable({
  trades,
  onClose
}: {
  trades: PaperTrade[];
  onClose?: (trade: PaperTrade) => void;
}) {
  const { marketMode } = useMarketMode();
  const isCrypto = marketMode === "crypto";

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin">
      <table className="min-w-[1120px] w-full text-left text-sm">
        <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-4 py-3">{isCrypto ? "Symbol" : "Ticker"}</th>
            <th className="px-4 py-3">Entry</th>
            <th className="px-4 py-3">Current</th>
            <th className="px-4 py-3">Stop</th>
            <th className="px-4 py-3">Take Profit</th>
            <th className="px-4 py-3">{isCrypto ? "Units" : "Qty"}</th>
            <th className="px-4 py-3">Position</th>
            <th className="px-4 py-3">P/L</th>
            <th className="px-4 py-3">Analysis</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {trades.map((trade) => (
            <tr key={trade.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-4 font-semibold text-stone-50">
                <div className="flex items-center gap-3">
                  <AssetLogo assetType={trade.assetType ?? (isCrypto ? "crypto" : "stock")} symbol={trade.ticker} size="sm" />
                  {trade.ticker}
                </div>
              </td>
              <td className="px-4 py-4">{usd.format(trade.entryPrice)}</td>
              <td className="px-4 py-4">{usd.format(trade.currentPrice)}</td>
              <td className="px-4 py-4 text-danger">{usd.format(trade.stopLoss)}</td>
              <td className="px-4 py-4 text-mint">{usd.format(trade.takeProfit)}</td>
              <td className="px-4 py-4">{trade.quantity}</td>
              <td className="px-4 py-4">{usd.format(trade.positionSize)}</td>
              <td className={`px-4 py-4 font-semibold ${trade.profitLoss >= 0 ? "text-mint" : "text-danger"}`}>
                {usd.format(trade.profitLoss)} <span className="text-xs">({percent(trade.profitLossPercent)})</span>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1.5">
                  <SafetyBadge label={analysisLabel(trade)} tone={analysisTone(trade)} />
                  {trade.analysis?.fallbackUsed ? <SafetyBadge label="Fallback used" tone="purple" /> : null}
                  {trade.analysis?.cached ? <SafetyBadge label="Cached" tone="neutral" /> : null}
                  {trade.analysis ? <span className="text-xs text-stone-500">{trade.analysis.confidence}%</span> : null}
                </div>
              </td>
              <td className="px-4 py-4">{trade.status}</td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-stone-200" disabled>
                    <Eye className="h-4 w-4" />
                    Journal
                  </button>
                  {trade.status === "Open" && onClose ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs text-mint"
                      onClick={() => onClose(trade)}
                      title="Close using a fresh server-side market quote"
                    >
                      <CircleDollarSign className="h-4 w-4" />
                      Close live
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
