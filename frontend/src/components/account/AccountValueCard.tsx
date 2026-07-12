import { ArrowDownRight, ArrowUpRight, Shield, WalletCards } from "lucide-react";
import { currencyFormatter, percent } from "../../lib/format";
import type { PaperAccount } from "../../lib/types";
import { SafetyBadge } from "../Badges";

export function AccountValueCard({ account }: { account: PaperAccount }) {
  const money = currencyFormatter(account.currency);
  const positive = account.totalEquity >= account.startingBalance;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const status = account.maxDrawdown >= 6 ? "DRAWDOWN WARNING" : positive ? "PROFIT" : account.totalEquity === account.startingBalance ? "BREAKEVEN" : "LOSS";

  return (
    <section className="rounded-lg border border-line bg-panel/90 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Paper account</p>
            <SafetyBadge label="PAPER ONLY" tone="green" />
            <SafetyBadge label={status} tone={status === "PROFIT" ? "green" : status === "DRAWDOWN WARNING" ? "red" : "amber"} />
          </div>
          <p className="mt-3 text-4xl font-semibold text-stone-50">{money.format(account.totalEquity)}</p>
          <p className={positive ? "mt-1 text-sm font-semibold text-mint" : "mt-1 text-sm font-semibold text-danger"}>
            <Icon className="mr-1 inline h-4 w-4" />
            {percent(account.totalReturnPercent)} total return from {money.format(account.startingBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-caution/25 bg-caution/10 p-3 text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <Shield className="h-4 w-4" />
            Real trading disabled
          </div>
          <p className="mt-1 text-xs text-amber-100/75">No leverage, margin, futures, or live orders.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={WalletCards} label="Cash balance" value={money.format(account.cashBalance)} />
        <Metric icon={WalletCards} label="Open positions value" value={money.format(account.openPositionsValue)} />
        <Metric icon={WalletCards} label="Unrealized P/L" value={money.format(account.unrealizedPnL)} tone={account.unrealizedPnL >= 0 ? "green" : "red"} />
        <Metric icon={WalletCards} label="Realized P/L" value={money.format(account.realizedPnL)} tone={account.realizedPnL >= 0 ? "green" : "red"} />
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
        <Icon className="h-4 w-4 text-stone-500" />
      </div>
      <p className={`mt-2 text-lg font-semibold ${tone === "green" ? "text-mint" : tone === "red" ? "text-danger" : "text-stone-50"}`}>{value}</p>
    </div>
  );
}
