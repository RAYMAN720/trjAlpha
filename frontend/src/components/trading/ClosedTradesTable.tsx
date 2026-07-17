import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { currencyFormatter, dateShort, percent } from "../../lib/format";
import type { AssetType, PaperPosition } from "../../lib/types";
import { AssetLogo } from "../assets/AssetLogo";

export function ClosedTradesTable({ positions, currency }: { positions: PaperPosition[]; currency: string }) {
  const money = currencyFormatter(currency);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin">
      <table className="min-w-[980px] w-full text-left text-sm">
        <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3">Buy</th>
            <th className="px-4 py-3">Sell</th>
            <th className="px-4 py-3">Realized P/L</th>
            <th className="px-4 py-3">Strategy</th>
            <th className="px-4 py-3">Exit reason</th>
            <th className="px-4 py-3">Closed</th>
            <th className="px-4 py-3">Chart</th>
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
              <td className="px-4 py-4">{position.exitPrice ? `$${position.exitPrice.toFixed(2)}` : "-"}</td>
              <td className={`px-4 py-4 font-semibold ${position.realizedPnL >= 0 ? "text-mint" : "text-danger"}`}>
                {money.format(position.realizedPnL)} <span className="text-xs">({percent(position.pnlPercent)})</span>
              </td>
              <td className="px-4 py-4">{position.strategyName}</td>
              <td className="px-4 py-4">{position.exitReason ?? position.status}</td>
              <td className="px-4 py-4">{position.closedAt ? dateShort(position.closedAt) : "-"}</td>
              <td className="px-4 py-4">
                <Link className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-stone-200" to={`/${position.assetType === "crypto" ? "crypto" : "stocks"}/${position.symbol}`}>
                  <ExternalLink className="h-4 w-4" />
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
