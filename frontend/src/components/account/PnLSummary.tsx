import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { currencyFormatter } from "../../lib/format";
import type { PaperAccount } from "../../lib/types";

export function PnLSummary({ account }: { account: PaperAccount }) {
  const money = currencyFormatter(account.currency);
  const rows = [
    { label: "Daily P/L", value: account.dailyPnL, icon: CalendarDays },
    { label: "Weekly P/L", value: account.weeklyPnL, icon: TrendingUp },
    { label: "Monthly P/L", value: account.monthlyPnL, icon: TrendingUp },
    { label: "Max drawdown", value: -Math.abs(account.maxDrawdown), suffix: "%", icon: TrendingDown }
  ];

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <h3 className="text-lg font-semibold text-stone-50">P/L Summary</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-line bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{row.label}</p>
              <row.icon className="h-4 w-4 text-stone-500" />
            </div>
            <p className={`mt-2 text-xl font-semibold ${row.value >= 0 ? "text-mint" : "text-danger"}`}>
              {row.suffix ? `${row.value.toFixed(2)}${row.suffix}` : money.format(row.value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
