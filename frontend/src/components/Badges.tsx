import { ShieldAlert, Sparkles } from "lucide-react";

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "border-mint/40 bg-mint/12 text-mint"
      : score >= 60
        ? "border-berry/40 bg-berry/12 text-purple-200"
        : "border-caution/40 bg-caution/12 text-caution";

  return (
    <span className={`inline-flex min-w-16 items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <Sparkles className="h-3.5 w-3.5" />
      {score}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const color =
    risk === "High"
      ? "border-danger/45 bg-danger/12 text-red-200"
      : risk === "Medium"
        ? "border-caution/45 bg-caution/12 text-amber-100"
        : "border-mint/45 bg-mint/12 text-emerald-100";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <ShieldAlert className="h-3.5 w-3.5" />
      {risk}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const label = decision.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase());
  const normalized = decision.toUpperCase();
  const color =
    normalized.includes("AVOID") || normalized.includes("BLOCKED")
      ? "border-danger/40 bg-danger/12 text-red-200"
      : normalized.includes("PAPER_TRADE") || normalized.includes("HIGH")
        ? "border-mint/40 bg-mint/12 text-mint"
        : normalized.includes("STRONG")
          ? "border-berry/40 bg-berry/12 text-purple-200"
          : normalized.includes("NO_TRADE")
            ? "border-caution/40 bg-caution/12 text-caution"
          : "border-line bg-white/5 text-stone-200";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

export function SafetyBadge({ label, tone = "neutral" }: { label: string; tone?: "green" | "amber" | "red" | "purple" | "neutral" }) {
  const color =
    tone === "green"
      ? "border-mint/40 bg-mint/12 text-mint"
      : tone === "amber"
        ? "border-caution/40 bg-caution/12 text-caution"
        : tone === "red"
          ? "border-danger/40 bg-danger/12 text-red-200"
          : tone === "purple"
            ? "border-berry/40 bg-berry/12 text-purple-200"
            : "border-line bg-white/5 text-stone-200";

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${color}`}>{label}</span>;
}
