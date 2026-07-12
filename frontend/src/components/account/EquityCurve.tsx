import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currencyFormatter, dateShort } from "../../lib/format";
import type { EquitySnapshot, PaperAccount } from "../../lib/types";

export function EquityCurve({ account, snapshots }: { account: PaperAccount; snapshots: EquitySnapshot[] }) {
  const money = currencyFormatter(account.currency);
  const data = snapshots.length
    ? snapshots.map((snapshot) => ({
        time: dateShort(snapshot.createdAt),
        equity: snapshot.totalEquity,
        drawdown: -Math.abs(snapshot.drawdown),
        pnl: snapshot.unrealizedPnL + snapshot.realizedPnL
      }))
    : [{ time: "Start", equity: account.startingBalance, drawdown: 0, pnl: 0 }];

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-stone-50">Account Equity Curve</h3>
        <p className="text-sm text-stone-400">Tracks cash plus open paper positions against the starting {money.format(account.startingBalance)} line.</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#33d69f" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#33d69f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#24242a" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#a8a29e", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fill: "#a8a29e", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => money.format(Number(value))} width={72} />
            <Tooltip
              contentStyle={{ background: "#18171c", border: "1px solid #34313a", borderRadius: 8, color: "#f5f5f4" }}
              formatter={(value, name) => [name === "drawdown" ? `${Number(value).toFixed(2)}%` : money.format(Number(value)), name]}
            />
            <ReferenceLine y={account.startingBalance} stroke="#f4c430" strokeDasharray="4 4" label={{ value: "Starting balance", fill: "#f4c430", fontSize: 11 }} />
            <Area type="monotone" dataKey="equity" stroke="#33d69f" strokeWidth={2} fill="url(#equityFill)" />
            <Bar dataKey="drawdown" fill="#ff5b5b" opacity={0.28} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
