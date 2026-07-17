import type { MarketMode } from "../../lib/marketMode";

const stockFrames = ["5m", "15m", "1h", "1d"];
const cryptoFrames = ["15m", "1h", "4h", "1d"];

export function ChartToolbar({
  marketMode,
  timeframe,
  onChange
}: {
  marketMode: MarketMode;
  timeframe: string;
  onChange: (timeframe: string) => void;
}) {
  const frames = marketMode === "crypto" ? cryptoFrames : stockFrames;
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white/[0.04] p-1">
      {frames.map((frame) => (
        <button
          key={frame}
          className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
            timeframe === frame ? "bg-caution text-ink" : "text-stone-400 hover:bg-white/6 hover:text-stone-100"
          }`}
          onClick={() => onChange(frame)}
        >
          {frame}
        </button>
      ))}
    </div>
  );
}
