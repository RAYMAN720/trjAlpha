import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: "green" | "purple" | "amber" | "red" | "neutral";
  trend?: "up" | "down" | "flat";
  to?: string;
};

const toneMap = {
  green: "bg-mint/12 text-mint border-mint/20",
  purple: "bg-berry/12 text-purple-200 border-berry/20",
  amber: "bg-caution/12 text-caution border-caution/20",
  red: "bg-danger/12 text-red-200 border-danger/20",
  neutral: "bg-white/7 text-stone-200 border-white/10"
};

function TrendIcon({ trend }: { trend?: StatCardProps["trend"] }) {
  if (trend === "up") return <ArrowUpRight className="h-4 w-4" />;
  if (trend === "down") return <ArrowDownRight className="h-4 w-4" />;
  if (trend === "flat") return <ArrowRight className="h-4 w-4" />;
  return null;
}

export function StatCard({ label, value, detail, subtitle, icon: Icon, tone = "neutral", trend, to }: StatCardProps) {
  const content = (
    <section className={`h-full rounded-lg border border-line bg-panel/88 p-4 shadow-glow ${to ? "transition hover:border-mint/30 hover:bg-white/[0.04]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold text-stone-50">{value}</p>
            {trend ? <span className={tone === "red" ? "text-danger" : tone === "green" ? "text-mint" : "text-stone-400"}><TrendIcon trend={trend} /></span> : null}
          </div>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-stone-500">{subtitle}</p> : null}
        </div>
        <span className={`shrink-0 rounded-lg border p-2 ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {detail ? <p className="mt-3 text-sm text-stone-400">{detail}</p> : null}
    </section>
  );

  return to ? <Link to={to} className="block h-full">{content}</Link> : content;
}
