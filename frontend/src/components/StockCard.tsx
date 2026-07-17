import { Building2, Coins } from "lucide-react";
import { compact, dateShort, percent, usd } from "../lib/format";
import type { Stock } from "../lib/types";

export function StockCard({ stock }: { stock: Stock }) {
  const isCrypto = stock.assetType === "crypto" || stock.sector === "Crypto";
  const Icon = isCrypto ? Coins : Building2;

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-berry/25 bg-berry/10 p-3 text-purple-200">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-stone-50">{stock.ticker}</h2>
            <p className="text-sm text-stone-400">{stock.companyName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-stone-50">{usd.format(stock.price)}</p>
          <p className={stock.dailyChangePercent >= 0 ? "text-mint" : "text-danger"}>{percent(stock.dailyChangePercent)}</p>
          {stock.quoteUpdatedAt ? (
            <p className="mt-1 text-xs text-stone-500">
              {stock.marketState ?? "Quote"} updated {dateShort(stock.quoteUpdatedAt)}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <dt className="text-stone-500">{isCrypto ? "Asset class" : "Sector"}</dt>
          <dd className="mt-1 font-semibold text-stone-100">{stock.sector}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <dt className="text-stone-500">{isCrypto ? "Pair" : "Industry"}</dt>
          <dd className="mt-1 font-semibold text-stone-100">{isCrypto ? `${stock.ticker}/USD` : stock.industry}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <dt className="text-stone-500">{isCrypto ? "24h Volume" : "Market Cap"}</dt>
          <dd className="mt-1 font-semibold text-stone-100">{compact.format(isCrypto ? stock.volume : stock.marketCap)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <dt className="text-stone-500">{isCrypto ? "Volatility" : "Relative Volume"}</dt>
          <dd className="mt-1 font-semibold text-stone-100">{isCrypto ? `${Math.abs(stock.dailyChangePercent).toFixed(2)}% 24h` : `${stock.relativeVolume.toFixed(2)}x`}</dd>
        </div>
      </dl>
      {stock.quoteSource ? <p className="mt-3 text-xs text-stone-500">Source: {stock.quoteSource}. Refreshes every 5 seconds when the feed allows it.</p> : null}
    </section>
  );
}
