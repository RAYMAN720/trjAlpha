import { Activity, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { MarketMode } from "../../lib/marketMode";
import { currencyFormatter, percent } from "../../lib/format";
import type { CandleResponse, PositionLine, Stock, TradeChartMarker } from "../../lib/types";
import { SafetyBadge } from "../Badges";
import { AssetLogo } from "../assets/AssetLogo";
import { ChartToolbar } from "./ChartToolbar";
import { PositionLines } from "./PositionLines";
import { TradeMarkers } from "./TradeMarkers";

const WIDTH = 920;
const HEIGHT = 430;
const PAD = { left: 48, right: 86, top: 28, bottom: 72 };
const euro = currencyFormatter("EUR");

function linePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

export function TradeChart({
  stock,
  marketMode
}: {
  stock: Stock;
  marketMode: MarketMode;
}) {
  const assetType = marketMode === "crypto" ? "crypto" : "stock";
  const [timeframe, setTimeframe] = useState(marketMode === "crypto" ? "1h" : "1d");
  const [candles, setCandles] = useState<CandleResponse | null>(null);
  const [markers, setMarkers] = useState<TradeChartMarker[]>([]);
  const [lines, setLines] = useState<PositionLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.candles(assetType, stock.ticker, timeframe),
      api.chartMarkers(assetType, stock.ticker),
      api.positionLines(assetType, stock.ticker)
    ])
      .then(([nextCandles, nextMarkers, nextLines]) => {
        if (!active) return;
        setCandles(nextCandles);
        setMarkers(nextMarkers);
        setLines(nextLines);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assetType, stock.ticker, timeframe]);

  const geometry = useMemo(() => {
    const data = candles?.candles ?? [];
    const lows = data.map((item) => item.low);
    const highs = data.map((item) => item.high);
    const linePrices = lines.map((line) => line.price);
    const min = Math.min(...lows, ...linePrices, stock.price) * 0.995;
    const max = Math.max(...highs, ...linePrices, stock.price) * 1.005;
    const chartWidth = WIDTH - PAD.left - PAD.right;
    const chartHeight = HEIGHT - PAD.top - PAD.bottom;
    const scaleY = (price: number) => PAD.top + ((max - price) / Math.max(0.01, max - min)) * chartHeight;
    const scaleXIndex = (index: number) => PAD.left + (index / Math.max(1, data.length - 1)) * chartWidth;
    const start = data[0] ? new Date(data[0].time).getTime() : Date.now();
    const end = data[data.length - 1] ? new Date(data[data.length - 1].time).getTime() : Date.now();
    const scaleXTime = (time: string) => {
      const value = new Date(time).getTime();
      return PAD.left + ((value - start) / Math.max(1, end - start)) * chartWidth;
    };
    const candleWidth = Math.max(3, Math.min(10, chartWidth / Math.max(1, data.length) - 2));
    return { data, min, max, chartWidth, chartHeight, scaleY, scaleXIndex, scaleXTime, candleWidth };
  }, [candles, lines, stock.price]);

  const last = geometry.data[geometry.data.length - 1];
  const activePosition = lines.length > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-[#111114] shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white/[0.025] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <AssetLogo assetType={assetType} symbol={stock.ticker} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-stone-50">{stock.ticker}</h3>
              <SafetyBadge label={candles?.dataQuality ?? "LOADING"} tone={candles?.dataQuality === "LIVE DATA" ? "green" : "amber"} />
              <SafetyBadge label="PAPER ONLY" tone="green" />
              {activePosition ? <SafetyBadge label="OPEN POSITION" tone="purple" /> : null}
            </div>
            <p className="truncate text-sm text-stone-400">{stock.companyName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-semibold text-stone-50">${stock.price.toFixed(2)}</p>
            <p className={stock.dailyChangePercent >= 0 ? "text-sm text-mint" : "text-sm text-danger"}>{percent(stock.dailyChangePercent)} 24h</p>
          </div>
          <ChartToolbar marketMode={marketMode} timeframe={timeframe} onChange={setTimeframe} />
        </div>
      </div>

      <div className="p-3">
        <div className="relative overflow-x-auto rounded-lg border border-line bg-[#0d0e10] scrollbar-thin">
          {loading ? (
            <div className="grid h-[430px] place-items-center text-sm text-stone-400">Loading professional chart...</div>
          ) : geometry.data.length ? (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-h-[360px] w-[920px] max-w-none md:w-full">
              <defs>
                <linearGradient id="profitZone" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#33d69f" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#33d69f" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="lossZone" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff5b5b" stopOpacity="0" />
                  <stop offset="100%" stopColor="#ff5b5b" stopOpacity="0.16" />
                </linearGradient>
              </defs>
              <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#0d0e10" />
              {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                const y = PAD.top + step * geometry.chartHeight;
                const price = geometry.max - step * (geometry.max - geometry.min);
                return (
                  <g key={step}>
                    <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="#26262b" strokeWidth={1} />
                    <text x={WIDTH - PAD.right + 12} y={y + 4} fill="#8b8680" fontSize={11}>
                      {price.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              {lines.find((line) => line.type === "entry") && lines.find((line) => line.type === "take_profit") ? (
                <rect
                  x={PAD.left}
                  y={geometry.scaleY(lines.find((line) => line.type === "take_profit")?.price ?? geometry.max)}
                  width={geometry.chartWidth}
                  height={Math.max(0, geometry.scaleY(lines.find((line) => line.type === "entry")?.price ?? geometry.min) - geometry.scaleY(lines.find((line) => line.type === "take_profit")?.price ?? geometry.max))}
                  fill="url(#profitZone)"
                />
              ) : null}
              {lines.find((line) => line.type === "entry") && lines.find((line) => line.type === "stop_loss") ? (
                <rect
                  x={PAD.left}
                  y={geometry.scaleY(lines.find((line) => line.type === "entry")?.price ?? geometry.max)}
                  width={geometry.chartWidth}
                  height={Math.max(0, geometry.scaleY(lines.find((line) => line.type === "stop_loss")?.price ?? geometry.min) - geometry.scaleY(lines.find((line) => line.type === "entry")?.price ?? geometry.max))}
                  fill="url(#lossZone)"
                />
              ) : null}
              {geometry.data.map((candle, index) => {
                const x = geometry.scaleXIndex(index);
                const openY = geometry.scaleY(candle.open);
                const closeY = geometry.scaleY(candle.close);
                const highY = geometry.scaleY(candle.high);
                const lowY = geometry.scaleY(candle.low);
                const positive = candle.close >= candle.open;
                const color = positive ? "#33d69f" : "#ff5b5b";
                const bodyY = Math.min(openY, closeY);
                const bodyHeight = Math.max(2, Math.abs(closeY - openY));
                const volumeHeight = Math.min(54, (candle.volume / Math.max(...geometry.data.map((item) => item.volume))) * 54);
                return (
                  <g key={candle.time}>
                    <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1.2} />
                    <rect x={x - geometry.candleWidth / 2} y={bodyY} width={geometry.candleWidth} height={bodyHeight} rx={1} fill={color} opacity={0.9} />
                    <rect x={x - geometry.candleWidth / 2} y={HEIGHT - PAD.bottom + 54 - volumeHeight} width={geometry.candleWidth} height={volumeHeight} fill={color} opacity={0.28} />
                  </g>
                );
              })}
              <path d={linePath(geometry.data.map((item, index) => ({ x: geometry.scaleXIndex(index), y: geometry.scaleY(item.ema9) })))} fill="none" stroke="#f4c430" strokeWidth={1.3} opacity={0.85} />
              <path d={linePath(geometry.data.map((item, index) => ({ x: geometry.scaleXIndex(index), y: geometry.scaleY(item.ema20) })))} fill="none" stroke="#6ee7ff" strokeWidth={1.1} opacity={0.72} />
              <path d={linePath(geometry.data.map((item, index) => ({ x: geometry.scaleXIndex(index), y: geometry.scaleY(item.ema50) })))} fill="none" stroke="#d96cff" strokeWidth={1.1} opacity={0.65} />
              <PositionLines lines={lines} scaleY={geometry.scaleY} width={WIDTH} left={PAD.left} right={WIDTH - PAD.right} />
              <TradeMarkers markers={markers} scaleX={geometry.scaleXTime} scaleY={geometry.scaleY} />
              <text x={PAD.left} y={HEIGHT - 18} fill="#8b8680" fontSize={11}>
                EMA 9
              </text>
              <text x={PAD.left + 54} y={HEIGHT - 18} fill="#8b8680" fontSize={11}>
                EMA 20
              </text>
              <text x={PAD.left + 116} y={HEIGHT - 18} fill="#8b8680" fontSize={11}>
                EMA 50
              </text>
              <text x={WIDTH - PAD.right - 180} y={HEIGHT - 18} fill="#8b8680" fontSize={11}>
                RSI {last?.rsi.toFixed(1)} | ATR {last?.atr.toFixed(2)} | MACD {last?.macd.toFixed(2)}
              </text>
            </svg>
          ) : (
            <div className="grid h-[430px] place-items-center text-sm text-stone-400">No chart candles available.</div>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-line p-4 text-sm md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Paper position</p>
          <p className="mt-1 font-semibold text-stone-100">{activePosition ? "Open and monitored" : "No open paper position"}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Markers</p>
          <p className="mt-1 font-semibold text-stone-100">{markers.length} buy/sell annotations</p>
        </div>
        <div className="rounded-lg border border-caution/25 bg-caution/10 p-3">
          <div className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <p className="font-semibold">Paper only</p>
          </div>
          <p className="mt-1 text-xs text-amber-100/80">No leverage, margin, futures, or real-money order routing.</p>
        </div>
      </div>
    </section>
  );
}
