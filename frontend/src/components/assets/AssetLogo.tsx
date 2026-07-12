import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { AssetLogoInfo, AssetType } from "../../lib/types";

export function AssetLogo({
  assetType,
  symbol,
  logo,
  size = "md"
}: {
  assetType: AssetType;
  symbol: string;
  logo?: AssetLogoInfo | null;
  size?: "sm" | "md" | "lg";
}) {
  const [assetLogo, setAssetLogo] = useState<AssetLogoInfo | null>(logo ?? null);
  const [failed, setFailed] = useState(false);
  const dimensions = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-[0.65rem]" : "h-9 w-9 text-xs";

  useEffect(() => {
    setFailed(false);
    if (logo) {
      setAssetLogo(logo);
      return;
    }
    let active = true;
    api.assetLogo(assetType, symbol)
      .then((next) => {
        if (active) setAssetLogo(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [assetType, symbol, logo]);

  const fallback = assetLogo?.fallbackText ?? symbol.slice(0, 3).toUpperCase();
  const fallbackColor = assetLogo?.fallbackColor ?? "#33d69f";

  if (assetLogo?.logoUrl && !failed) {
    return (
      <img
        src={assetLogo.logoUrl}
        alt={`${symbol} logo`}
        className={`${dimensions} rounded-full border border-white/10 bg-white object-contain p-1`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dimensions} inline-grid shrink-0 place-items-center rounded-full border border-white/10 font-bold text-ink`}
      style={{ backgroundColor: fallbackColor }}
      title={`${symbol} logo unavailable`}
    >
      {fallback}
    </div>
  );
}
