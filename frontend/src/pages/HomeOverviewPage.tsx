import { ArrowRight, Coins, LineChart, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SafetyBadge, ScoreBadge } from "../components/Badges";
import { DailyBriefingCard } from "../components/DisciplinePanels";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import { currencyFormatter } from "../lib/format";
import type { AssetDashboard, DailyBriefing } from "../lib/types";

function OverviewCard({
  title,
  mode,
  dashboard
}: {
  title: string;
  mode: "stocks" | "crypto";
  dashboard: AssetDashboard | null;
}) {
  const money = currencyFormatter(dashboard?.settings.displayCurrency ?? "USD");
  const accent = mode === "crypto" ? "border-berry/30 bg-berry/10 text-purple-100" : "border-mint/30 bg-mint/10 text-mint";
  const Icon = mode === "crypto" ? Coins : LineChart;
  const best = dashboard?.bestCandidate;

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${accent}`}>
            <Icon className="h-4 w-4" />
            {title}
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-stone-50">{title} Paper Research</h2>
          <p className="mt-2 text-sm leading-6 text-stone-400">
            {mode === "crypto"
              ? "Crypto scanner, research reports, and simulated trades stay isolated from stocks."
              : "Stock scanner, research reports, and simulated trades stay isolated from crypto."}
          </p>
        </div>
        <WalletCards className={mode === "crypto" ? "h-6 w-6 text-purple-200" : "h-6 w-6 text-mint"} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Paper account value</p>
          <p className="mt-2 text-xl font-semibold text-stone-50">{money.format(dashboard?.settings.demoCapital ?? 500)}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Open paper trades</p>
          <p className="mt-2 text-xl font-semibold text-stone-50">{dashboard?.openPaperTrades ?? 0}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Today P/L</p>
          <p className={(dashboard?.todayProfit ?? 0) >= 0 ? "mt-2 text-xl font-semibold text-mint" : "mt-2 text-xl font-semibold text-danger"}>
            {money.format(dashboard?.todayProfit ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Best candidate</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-semibold text-stone-50">{best?.ticker ?? "Waiting"}</span>
            {best ? <ScoreBadge score={best.score} /> : null}
          </div>
        </div>
      </div>

      <Link
        to={mode === "crypto" ? "/crypto" : "/stocks"}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90"
      >
        Open {title} Dashboard
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function HomeOverviewPage() {
  const [stocks, setStocks] = useState<AssetDashboard | null>(null);
  const [crypto, setCrypto] = useState<AssetDashboard | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.dashboard("stocks"), api.dashboard("crypto"), api.dailyBriefing()])
      .then(([stockData, cryptoData, briefingData]) => {
        setStocks(stockData);
        setCrypto(cryptoData);
        setBriefing(briefingData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">TradePilot Overview</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-50">Stocks and crypto are separated.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              This app is a research and paper-trading tool. It does not provide financial advice.
            </p>
          </div>
          <ShieldCheck className="h-7 w-7 text-mint" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <SafetyBadge label="PAPER TRADING ONLY" tone="green" />
          <SafetyBadge label="REAL TRADING DISABLED" tone="red" />
          <SafetyBadge label="NO LEVERAGE" tone="amber" />
        </div>
      </section>

      {briefing ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DailyBriefingCard briefing={briefing.stocks} />
          <DailyBriefingCard briefing={briefing.crypto} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewCard title="Stocks" mode="stocks" dashboard={stocks} />
        <OverviewCard title="Crypto" mode="crypto" dashboard={crypto} />
      </div>
    </div>
  );
}
