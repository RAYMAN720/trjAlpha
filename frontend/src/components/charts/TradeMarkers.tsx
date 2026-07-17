import type { TradeChartMarker } from "../../lib/types";

function markerColor(marker: TradeChartMarker) {
  if (marker.markerType === "SELL" || marker.colorType === "red") return "#ff5b5b";
  return "#33d69f";
}

export function TradeMarkers({
  markers,
  scaleX,
  scaleY
}: {
  markers: TradeChartMarker[];
  scaleX: (time: string) => number;
  scaleY: (price: number) => number;
}) {
  return (
    <g>
      {markers.map((marker) => {
        const x = scaleX(marker.time);
        const y = scaleY(marker.price);
        const color = markerColor(marker);
        const isBuy = marker.markerType === "BUY";
        return (
          <g key={marker.id}>
            <line x1={x} x2={x} y1={y + (isBuy ? 12 : -12)} y2={y + (isBuy ? 28 : -28)} stroke={color} strokeWidth={1.2} />
            <path
              d={isBuy ? `M ${x} ${y - 10} L ${x - 7} ${y + 3} L ${x + 7} ${y + 3} Z` : `M ${x} ${y + 10} L ${x - 7} ${y - 3} L ${x + 7} ${y - 3} Z`}
              fill={color}
              stroke="#0f1012"
              strokeWidth={1}
            />
            <rect x={x - 32} y={y + (isBuy ? 31 : -50)} width={64} height={18} rx={4} fill="#111114" stroke={color} opacity={0.94} />
            <text x={x} y={y + (isBuy ? 44 : -37)} fill={color} fontSize={10} fontWeight={800} textAnchor="middle">
              {marker.markerType} {marker.price.toFixed(2)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
