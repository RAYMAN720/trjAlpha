import { ExternalLink, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { currencyFormatter, dateShort, percent } from "../../lib/format";
import type { AssetType, PaperPosition } from "../../lib/types";
import { AssetLogo } from "../assets/AssetLogo";

export function OpenPositionsTable({
  positions,
  currency,
  onClose
}: {
  positions: PaperPosition[];
  currency: string;
  onClose?: (position: PaperPosition) => void;
}) {
  const money = currencyFormatter(currency);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin">
      <table className="min-w-[1080px] w-full text-left text-sm">
        <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3">Entry</th>
            <th className="px-4 py-3">Current</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Value</th>
            <th className="px-4 py-3">Unrealized P/L</th>
            <th className="px-4 py-3">Stop</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Strategy</th>
            <th className="px-4 py-3">Opened</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {positions.map((position) => (
            <tr key={position.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <AssetLogo assetType={position.assetType as AssetType} symbol={position.symbol} size="sm" />
                  <div>
                    <p className="font-semibold text-stone-50">{position.symbol}</p>
                    <p className="text-xs text-stone-500">{position.assetName}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">${position.entryPrice.toFixed(2)}</td>
              <td className="px-4 py-4">${position.currentPrice.toFixed(2)}</td>
              <td className="px-4 py-4">{position.quantity}</td>
              <td className="px-4 py-4">{money.format(position.positionValue)}</td>
              <td className={`px-4 py-4 font-semibold ${position.unrealizedPnL >= 0 ? "text-mint" : "text-danger"}`}>
                {money.format(position.unrealizedPnL)} <span className="text-xs">({percent(position.pnlPercent)})</span>
              </td>
              <td className="px-4 py-4 text-danger">${position.stopLoss.toFixed(2)}</td>
              <td className="px-4 py-4 text-mint">${position.takeProfit.toFixed(2)}</td>
              <td className="px-4 py-4">{position.strategyName}</td>
              <td className="px-4 py-4">{dateShort(position.openedAt)}</td>
              <td className="px-4 py-4">
                <div className="flex gap-2">
                  <Link className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-stone-200" to={`/${position.assetType === "crypto" ? "crypto" : "stocks"}/${position.symbol}`}>
                    <ExternalLink className="h-4 w-4" />
                    Chart
                  </Link>
                  {onClose ? (
                    <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs text-red-200" onClick={() => onClose(position)}>
                      <XCircle className="h-4 w-4" />
                      Close
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
