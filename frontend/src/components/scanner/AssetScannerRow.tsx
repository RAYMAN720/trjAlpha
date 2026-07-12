import { Link } from "react-router-dom";
import { percent, usd } from "../../lib/format";
import type { MarketSignal } from "../../lib/types";
import { DecisionBadge, RiskBadge, ScoreBadge } from "../Badges";
import { AssetLogo } from "../assets/AssetLogo";

export function AssetScannerRow({ signal }: { signal: MarketSignal }) {
  const assetType = signal.assetType ?? "stock";
  const base = assetType === "crypto" ? "/crypto" : "/stocks";
  return (
    <Link to={`${base}/${signal.ticker}`} className="grid gap-3 rounded-lg border border-line bg-panel/88 p-4 transition hover:border-mint/30 hover:bg-white/[0.04] md:grid-cols-[1.1fr_0.8fr_1fr] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <AssetLogo assetType={assetType} symbol={signal.ticker} size="md" />
        <div className="min-w-0">
          <p className="font-semibold text-stone-50">{signal.ticker}</p>
          <p className="truncate text-sm text-stone-500">{signal.signalType}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-stone-100">{usd.format(signal.price)}</p>
        <p className={signal.dailyChangePercent >= 0 ? "text-sm text-mint" : "text-sm text-danger"}>{percent(signal.dailyChangePercent)}</p>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <ScoreBadge score={signal.score} />
        <RiskBadge risk={signal.riskLevel} />
        <DecisionBadge decision={signal.decision} />
      </div>
    </Link>
  );
}
