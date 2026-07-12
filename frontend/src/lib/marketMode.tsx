import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { safeGetItem, safeSetItem } from "./storage";

export type MarketMode = "stocks" | "crypto";

type MarketModeContextValue = {
  marketMode: MarketMode;
  setMarketMode: (mode: MarketMode) => void;
  marketLabel: string;
  assetLabel: string;
  assetType: "stock" | "crypto";
};

const storageKey = "tradepilot_market_mode";
const MarketModeContext = createContext<MarketModeContextValue | null>(null);

function normalizeMarketMode(value: string | null): MarketMode {
  return value === "crypto" ? "crypto" : "stocks";
}

export function MarketModeProvider({ children }: { children: ReactNode }) {
  const [marketMode, setMarketModeState] = useState<MarketMode>(() => normalizeMarketMode(safeGetItem(storageKey)));

  const setMarketMode = useCallback((mode: MarketMode) => {
    setMarketModeState(mode);
    safeSetItem(storageKey, mode);
  }, []);

  useEffect(() => {
    safeSetItem(storageKey, marketMode);
  }, [marketMode]);

  const value = useMemo<MarketModeContextValue>(
    () => ({
      marketMode,
      setMarketMode,
      marketLabel: marketMode === "crypto" ? "Crypto" : "Stocks",
      assetLabel: marketMode === "crypto" ? "assets" : "stocks",
      assetType: marketMode === "crypto" ? "crypto" : "stock"
    }),
    [marketMode]
  );

  return <MarketModeContext.Provider value={value}>{children}</MarketModeContext.Provider>;
}

export function marketBasePath(mode: MarketMode) {
  return mode === "crypto" ? "/crypto" : "/stocks";
}

export function marketRoute(mode: MarketMode, section = "") {
  const base = marketBasePath(mode);
  return section ? `${base}/${section.replace(/^\/+/, "")}` : base;
}

export function assetDetailRoute(mode: MarketMode, symbol: string) {
  return `${marketBasePath(mode)}/${symbol.toUpperCase()}`;
}

export function useRouteMarketMode(): MarketMode {
  const location = useLocation();
  if (location.pathname.startsWith("/crypto")) return "crypto";
  return "stocks";
}

export function MarketModeRoute({ mode, children }: { mode: MarketMode; children: ReactNode }) {
  const { setMarketMode } = useMarketMode();

  useEffect(() => {
    setMarketMode(mode);
  }, [mode, setMarketMode]);

  return <>{children}</>;
}

export function useMarketMode() {
  const value = useContext(MarketModeContext);
  if (!value) {
    throw new Error("useMarketMode must be used inside MarketModeProvider.");
  }
  return value;
}
