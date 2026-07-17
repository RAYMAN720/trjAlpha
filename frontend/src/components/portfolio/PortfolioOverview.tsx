import { EmptyState } from "../EmptyState";
import { AccountValueCard } from "../account/AccountValueCard";
import { EquityCurve } from "../account/EquityCurve";
import { PnLSummary } from "../account/PnLSummary";
import { ClosedTradesTable } from "../trading/ClosedTradesTable";
import { OpenPositionsTable } from "../trading/OpenPositionsTable";
import { TradeActivityFeed } from "../trading/TradeActivityFeed";
import type { PaperAccountSummary, PaperPosition } from "../../lib/types";
import { WalletCards } from "lucide-react";

export function PortfolioOverview({
  summary,
  onClosePosition
}: {
  summary: PaperAccountSummary;
  onClosePosition?: (position: PaperPosition) => void;
}) {
  return (
    <div className="space-y-6">
      <AccountValueCard account={summary.account} />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <EquityCurve account={summary.account} snapshots={summary.snapshots} />
        <PnLSummary account={summary.account} />
      </div>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-50">Open Positions</h3>
        {summary.openPositions.length ? (
          <OpenPositionsTable positions={summary.openPositions} currency={summary.account.currency} onClose={onClosePosition} />
        ) : (
          <EmptyState icon={WalletCards} title="No open paper positions" description="Approved paper trades will reduce cash and appear here with live unrealized P/L." />
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-50">Closed Trades</h3>
        {summary.closedPositions.length ? (
          <ClosedTradesTable positions={summary.closedPositions} currency={summary.account.currency} />
        ) : (
          <EmptyState icon={WalletCards} title="No closed paper trades" description="Closed trades will show realized profit/loss and exit reasons." />
        )}
      </section>
      <TradeActivityFeed events={summary.activityFeed} />
    </div>
  );
}
