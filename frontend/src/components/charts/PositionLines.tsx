import type { PositionLine } from "../../lib/types";

function lineColor(colorType: string) {
  if (colorType === "red") return "#ff5b5b";
  if (colorType === "green") return "#33d69f";
  return "#a8a29e";
}

export function PositionLines({
  lines,
  scaleY,
  width,
  left,
  right
}: {
  lines: PositionLine[];
  scaleY: (price: number) => number;
  width: number;
  left: number;
  right: number;
}) {
  return (
    <g>
      {lines.map((line) => {
        const y = scaleY(line.price);
        return (
          <g key={`${line.type}-${line.price}`}>
            <line x1={left} x2={right} y1={y} y2={y} stroke={lineColor(line.colorType)} strokeDasharray="5 5" strokeWidth={1.4} opacity={0.92} />
            <rect x={width - 104} y={y - 11} width={98} height={22} rx={4} fill="#111114" stroke={lineColor(line.colorType)} opacity={0.96} />
            <text x={width - 98} y={y + 4} fill={lineColor(line.colorType)} fontSize={10} fontWeight={700}>
              {line.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
