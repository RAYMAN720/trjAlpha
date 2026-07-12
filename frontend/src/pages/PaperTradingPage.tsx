import { BarChart3, RadioTower, Trophy, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AccountValueCard } from "../components/account/AccountValueCard";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PaperTradeTable } from "../components/PaperTradeTable";
import { PortfolioOverview } from "../components/portfolio/PortfolioOverview";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { percent, usd } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { PaperAccountSummary, PaperPosition, PaperTrade } from "../lib/types";

export function PaperTradingPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [summary, setSummary] = useState<PaperAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [nextTrades, nextSummary] = await Promise.all([api.paperTrades(marketMode), api.paperAccount(marketMode)]);
    setTrades(nextTrades);
    setSummary(nextSummary);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => trade.status !== "Open");
    const winners = closed.filter((trade) => trade.profitLoss > 0);
    const losers = closed.filter((trade) => trade.profitLoss < 0);
    const best = [...trades].sort((a, b) => b.profitLoss - a.profitLoss)[0];
    const worst = [...trades].sort((a, b) => a.profitLoss - b.profitLoss)[0];
    return {
      open: trades.filter((trade) => trade.status === "Open"),
      closed,
      totalPl: trades.reduce((total, trade) => total + trade.profitLoss, 0),
      winRate: closed.length ? (winners.length / closed.length) * 100 : 0,
      avgGain: winners.length ? winners.reduce((total, trade) => total + trade.profitLoss, 0) / winners.length : 0,
      avgLoss: losers.length ? losers.reduce((total, trade) => total + trade.profitLoss, 0) / losers.length : 0,
      best,
      worst
    };
  }, [trades]);

  async function closeTrade(trade: PaperTrade) {
    await api.closePaperTrade(trade.id, { status: "manual_close" });
    await load();
  }

  async function closePosition(position: PaperPosition) {
    if (!position.sourcePaperTradeId) return;
    await api.closePaperTrade(position.sourcePaperTradeId, { status: "manual_close" });
    await load();
  }

  if (loading || !summary) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-amber-100">
        {marketMode === "crypto"
          ? "Crypto paper trading only. Real crypto trading, leverage, futures, and withdrawals are disabled."
          : "Stock paper trading only. Real trading is disabled."} Paper trading results do not guarantee real trading results.
      </section>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Simulation ledger</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Paper Trading</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-caution px-4 text-sm font-semibold text-ink hover:bg-caution/90" to={`/${marketMode === "crypto" ? "crypto" : "stocks"}/paper-trading/live`}>
          <RadioTower className="h-4 w-4" />
          Open Live Terminal
        </Link>
      </div>

      <AccountValueCard account={summary.account} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`${marketLabel} total P/L`} value={usd.format(stats.totalPl)} icon={WalletCards} tone={stats.totalPl >= 0 ? "green" : "red"} />
        <StatCard label={`${marketLabel} win rate`} value={percent(stats.winRate).replace("+", "")} icon={BarChart3} tone="purple" />
        <StatCard label={`${marketLabel} average gain`} value={usd.format(stats.avgGain)} icon={Trophy} tone="green" />
        <StatCard label={`${marketLabel} average loss`} value={usd.format(stats.avgLoss)} icon={BarChart3} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Best trade</h3>
          <p className="mt-3 text-2xl font-semibold text-mint">{stats.best ? `${stats.best.ticker} ${usd.format(stats.best.profitLoss)}` : "None"}</p>
        </section>
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Worst trade</h3>
          <p className="mt-3 text-2xl font-semibold text-danger">{stats.worst ? `${stats.worst.ticker} ${usd.format(stats.worst.profitLoss)}` : "None"}</p>
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-50">Open paper trades</h3>
        {stats.open.length ? (
          <PaperTradeTable trades={stats.open} onClose={closeTrade} />
        ) : (
          <EmptyState icon={WalletCards} title="No open paper trades" description="Approve a paper trade plan to start tracking performance." />
        )}
      </section>

      <PortfolioOverview summary={summary} onClosePosition={closePosition} />

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-50">Closed paper trades</h3>
        {stats.closed.length ? (
          <PaperTradeTable trades={stats.closed} />
        ) : (
          <EmptyState icon={BarChart3} title="No closed trades" description="Closed paper trades will appear here with exit price and result." />
        )}
      </section>
    </div>
  );
}
