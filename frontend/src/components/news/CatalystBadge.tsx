import type { MarketNewsItem } from "../../lib/types";

export function CatalystBadge({ item }: { item: MarketNewsItem }) {
  const tone =
    item.decision === "BLOCKED_BY_RISK"
      ? "border-danger/30 bg-danger/10 text-red-200"
      : item.sentiment === "bullish"
        ? "border-mint/30 bg-mint/10 text-mint"
        : item.sentiment === "bearish"
          ? "border-danger/30 bg-danger/10 text-red-200"
          : "border-line bg-white/[0.04] text-stone-300";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {item.catalystType}
    </span>
  );
}
