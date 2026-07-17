import type { MockStock } from "../../data/mockStocks.js";

export function buildSectorBriefing(universe: MockStock[]) {
  const bySector = new Map<string, { sector: string; count: number; move: number; volume: number }>();

  for (const asset of universe) {
    const current = bySector.get(asset.sector) ?? { sector: asset.sector, count: 0, move: 0, volume: 0 };
    current.count += 1;
    current.move += asset.dailyChangePercent;
    current.volume += asset.volume;
    bySector.set(asset.sector, current);
  }

  const sectors = [...bySector.values()]
    .map((sector) => ({
      sector: sector.sector,
      averageMove: Number((sector.move / Math.max(1, sector.count)).toFixed(2)),
      totalVolume: sector.volume,
      namesTracked: sector.count
    }))
    .sort((left, right) => right.averageMove - left.averageMove);

  return {
    strongestSectors: sectors.slice(0, 3),
    weakestSectors: sectors.slice(-3).reverse(),
    sectorBreadth: sectors.length ? Number((sectors.filter((sector) => sector.averageMove > 0).length / sectors.length * 100).toFixed(1)) : 0
  };
}
