import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "../lib/types";
import { usd } from "../lib/format";

export function ChartCard({ data }: { data: ChartPoint[] }) {
  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-stone-50">Price Chart</h3>
          <p className="text-sm text-stone-400">Mock 30-day price path</p>
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#33d69f" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#33d69f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: "#a8a29e", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              tick={{ fill: "#a8a29e", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={(value) => usd.format(Number(value))}
            />
            <Tooltip
              contentStyle={{ background: "#18171c", border: "1px solid #34313a", borderRadius: 8, color: "#f5f5f4" }}
              formatter={(value) => usd.format(Number(value))}
            />
            <Area type="monotone" dataKey="price" stroke="#33d69f" strokeWidth={2} fill="url(#priceFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
