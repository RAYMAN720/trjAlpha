import { Activity, AlertTriangle, Brain, Gauge, Play, RadioTower, ShieldOff, Star, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { currencyFormatter, dateShort, percent } from "../lib/format";
import type { AutomationStatus, MarketScan, PaperTrade, Stock, UserSettings, WatchlistItem } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { SignalTable } from "../components/SignalTable";
import { StatCard } from "../components/StatCard";
import { assetDetailRoute, marketRoute, useMarketMode } from "../lib/marketMode";
import { DecisionBadge, RiskBadge, SafetyBadge, ScoreBadge } from "../components/Badges";
import { DailyBriefingCard, NoTradePanel, RiskStatePanel } from "../components/DisciplinePanels";
import type { MarketBriefing, NoTradeStatus, RiskStatus } from "../lib/types";
import { AssetLogo } from "../components/assets/AssetLogo";

export function DashboardPage() {
  const { marketMode, assetLabel, marketLabel } = useMarketMode();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [scan, setScan] = useState<MarketScan | null>(null);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [topStock, setTopStock] = useState<Stock | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [briefing, setBriefing] = useState<MarketBriefing | null>(null);
  const [noTrade, setNoTrade] = useState<NoTradeStatus | null>(null);
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);

  async function loadScan() {
    const latest = await api.latestScan(marketMode);
    const stale =
      !latest ||
      latest.signals.length === 0 ||
      Date.now() - new Date(latest.scanDate).getTime() > 5_000;

    return stale ? api.runScan({ market: marketMode }) : latest;
  }

  function applyScan(next: MarketScan | null) {
    setScan(next);
    setLiveUpdatedAt(next?.scanDate ?? null);
  }

  async function load() {
    const [settingsData, scanData, tradeData, watchData, automationData, briefingData, noTradeData, riskData] = await Promise.all([
      api.settings(),
      loadScan(),
      api.paperTrades(marketMode),
      api.watchlist(marketMode),
      api.automationStatus(),
      api.marketBriefing(marketMode),
      api.noTradeStatus(marketMode),
      api.riskStatus(marketMode)
    ]);
    setSettings(settingsData);
    applyScan(scanData);
    setTrades(tradeData);
    setWatchlist(watchData);
    setAutomation(automationData);
    setBriefing(briefingData);
    setNoTrade(noTradeData);
    setRiskStatus(riskData);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      api
        .runScan({ market: marketMode })
        .then(applyScan)
        .catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [marketMode]);

  useEffect(() => {
    const ticker = scan?.signals[0]?.ticker;
    if (!ticker) {
      setTopStock(null);
      return;
    }

    api
      .stock(ticker, marketMode)
      .then(setTopStock)
      .catch(() => setTopStock(null));
  }, [scan?.signals[0]?.ticker, marketMode]);

  const openTrades = trades.filter((trade) => trade.status === "Open");
  const todayProfit = openTrades.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalProfit = trades.reduce((total, trade) => total + trade.profitLoss, 0);
  const totalOpenRisk = openTrades.reduce((total, trade) => total + Math.max(0, trade.entryPrice - trade.stopLoss) * trade.quantity, 0);
  const bestScore = scan?.signals[0]?.score ?? 0;
  const topCandidate = scan?.signals[0];
  const hasCompletedScan = Boolean(scan && scan.totalScanned > 0);
  const money = currencyFormatter(settings?.displayCurrency ?? "USD");
  const title = marketMode === "crypto" ? "Today's Crypto Opportunities" : "Today's Stock Opportunities";
  const livePriceText = marketMode === "crypto" ? "Live crypto prices" : "Live stock prices";
  const marketMood = useMemo(() => {
    const signals = scan?.signals ?? [];
    if (!signals.length) return "Neutral";
    const average = signals.reduce((total, signal) => total + signal.dailyChangePercent, 0) / signals.length;
    const highVolatility = signals.some((signal) => Math.abs(signal.dailyChangePercent) > 15);
    if (highVolatility) return "High volatility";
    if (average > 3) return "Bullish";
    if (average < -2) return "Bearish";
    return "Neutral";
  }, [scan]);

  async function runScan() {
    setRunning(true);
    try {
      const next = await api.runScan({ market: marketMode });
      applyScan(next);
      setAutomation(await api.automationStatus());
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-7 pt-4 sm:pt-6">
      <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-sm font-semibold text-amber-100">
        {marketMode === "crypto"
          ? "Crypto paper trading only. Real crypto trading, leverage, futures, and withdrawals are disabled."
          : "Stock paper trading only. Real trading is disabled."} Paper trading results do not guarantee real trading results.
      </section>

      {marketMode === "crypto" ? (
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label="CRYPTO PAPER TRADING ONLY" tone="purple" />
          <SafetyBadge label="HIGH VOLATILITY" tone="amber" />
          <SafetyBadge label="NO LEVERAGE" tone="red" />
          <SafetyBadge label="REAL CRYPTO TRADING DISABLED" tone="red" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label="STOCK PAPER TRADING ONLY" tone="green" />
          <SafetyBadge label="REAL TRADING DISABLED" tone="red" />
        </div>
      )}

      {briefing ? <DailyBriefingCard briefing={briefing} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {noTrade ? <NoTradePanel status={noTrade} /> : null}
        {riskStatus ? <RiskStatePanel status={riskStatus} /> : null}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 pt-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Market mood: {marketMood}</p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-50 md:text-3xl">{title}</h2>
          {liveUpdatedAt ? (
            <p className="mt-2 text-sm leading-6 text-stone-400">{livePriceText} refreshed {dateShort(liveUpdatedAt)} and refresh every 5 seconds.</p>
          ) : null}
        </div>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
          onClick={runScan}
          disabled={running}
        >
          <Play className="h-4 w-4" />
          {running ? "Scanning..." : `Run ${marketLabel} Scan`}
        </button>
      </div>

      {topCandidate ? (
        <section className="rounded-lg border border-mint/20 bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Top Candidate</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <AssetLogo assetType={topCandidate.assetType ?? (marketMode === "crypto" ? "crypto" : "stock")} symbol={topCandidate.ticker} size="md" />
                <h3 className="text-2xl font-semibold text-stone-50">{topCandidate.ticker}</h3>
                <p className="text-sm text-stone-400">{topStock?.companyName ?? "Company details loading"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ScoreBadge score={topCandidate.score} />
              <RiskBadge risk={topCandidate.riskLevel} />
              <DecisionBadge decision={topCandidate.decision} />
              {topCandidate.researchQuality ? <SafetyBadge label={topCandidate.researchQuality} tone={topCandidate.researchQuality.includes("LOW") ? "red" : topCandidate.researchQuality.includes("LIMITED") ? "amber" : "purple"} /> : null}
              {topCandidate.strategyStatus ? <SafetyBadge label={topCandidate.strategyStatus} tone={topCandidate.strategyStatus === "TESTING" ? "purple" : topCandidate.strategyStatus === "PROVEN" ? "green" : "amber"} /> : null}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Reason Detected</p>
            <p className="mt-2 text-sm leading-6 text-stone-300">{topCandidate.explanation}</p>
          </div>
          <Link
            to={assetDetailRoute(marketMode, topCandidate.ticker)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90"
          >
            View Research
          </Link>
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-stone-100">
            <RadioTower className="h-5 w-5 text-mint" />
            <h3 className="text-lg font-semibold">Automation Status</h3>
          </div>
          <SafetyBadge label="Real trading disabled" tone="red" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Auto scanner</p>
            <p className="mt-2 font-semibold text-mint">{automation?.autoScanOn ? "ON" : "OFF"}</p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Last scan</p>
            <p className="mt-2 font-semibold text-stone-100">{automation?.lastScanTime ? dateShort(automation.lastScanTime) : "Waiting"}</p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Next scan</p>
            <p className="mt-2 font-semibold text-stone-100">{automation?.nextScanTime ? dateShort(automation.nextScanTime) : "Queued"}</p>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Auto paper trading</p>
            <p className={automation?.autoPaperTrading ? "mt-2 font-semibold text-mint" : "mt-2 font-semibold text-caution"}>
              {automation?.autoPaperTrading ? "ON" : "OFF"}
            </p>
          </div>
          <div className="rounded-lg border border-danger/25 bg-danger/10 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-red-200/70">Real trading</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-red-200">
              <ShieldOff className="h-4 w-4" />
              DISABLED
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <StatCard to={marketRoute(marketMode, "paper-trading")} label="Paper Account Capital" value={money.format(settings?.demoCapital ?? 500)} subtitle="Simulated buying power" icon={WalletCards} tone="green" trend="flat" />
        <StatCard to={marketRoute(marketMode, "paper-trading")} label="Open Paper Trades" value={openTrades.length} subtitle="Active simulated positions" icon={Activity} tone="purple" trend="flat" />
        <StatCard to="/strategy" label="Today P/L" value={money.format(todayProfit)} subtitle="Open trade mark-to-market" icon={TrendingUp} tone={todayProfit >= 0 ? "green" : "red"} trend={todayProfit >= 0 ? "up" : "down"} />
        <StatCard to="/strategy" label="Total P/L" value={money.format(totalProfit)} subtitle="Closed and open simulated results" icon={TrendingUp} tone={totalProfit >= 0 ? "green" : "red"} trend={totalProfit >= 0 ? "up" : "down"} />
        <StatCard
          label="Total Open Risk"
          value={money.format(totalOpenRisk)}
          subtitle="Total potential loss if all active stop-losses are hit."
          detail={`Risk per trade: ${settings?.riskPerTradePercent ?? 1}%`}
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard to={marketRoute(marketMode, "scanner")} label="Best Candidate Score" value={bestScore} subtitle="Highest current scanner score" icon={Brain} tone="purple" trend={bestScore >= 75 ? "up" : "flat"} />
        <StatCard to={marketRoute(marketMode, "scanner")} label={`${marketLabel} Scanned`} value={scan?.totalScanned ?? 0} subtitle="Assets reviewed in latest scan" icon={Gauge} tone="neutral" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-stone-50">Top Opportunities</h3>
          <Link to={marketRoute(marketMode, "scanner")} className="text-sm font-semibold text-mint hover:text-mint/80">
            Open Scanner
          </Link>
        </div>
        {scan?.signals.length ? (
          <SignalTable signals={scan.signals.slice(0, 8)} compact />
        ) : (
          <EmptyState
            icon={Gauge}
            title={
              hasCompletedScan
                ? `No ${marketLabel.toLowerCase()} candidates matched the filters`
                : marketMode === "crypto"
                  ? "Refreshing crypto scan"
                  : "No scan yet"
            }
            description={
              hasCompletedScan
                ? `The scan checked ${scan?.totalScanned ?? 0} ${assetLabel}. Open the scanner to lower liquidity or score filters.`
                : marketMode === "crypto"
                  ? `The app is pulling fresh ${assetLabel} prices and ranking opportunities.`
                  : `Run a market scan to rank the ${assetLabel} universe.`
            }
          />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Open Paper Trades</h3>
          <div className="mt-4 space-y-3">
            {openTrades.slice(0, 4).map((trade) => (
              <div key={trade.id} className="flex items-center justify-between rounded-lg border border-line bg-white/[0.03] p-3">
                <div>
                  <p className="font-semibold text-stone-100">{trade.ticker}</p>
                  <p className="text-sm text-stone-500">
                    {trade.quantity} {marketMode === "crypto" ? "units" : "shares"}
                  </p>
                </div>
                <p className={trade.profitLoss >= 0 ? "font-semibold text-mint" : "font-semibold text-danger"}>
                  {money.format(trade.profitLoss)} ({percent(trade.profitLossPercent)})
                </p>
              </div>
            ))}
            {!openTrades.length ? <EmptyState icon={WalletCards} title="No Open Trades" description="Approve a paper trade plan to track it here." /> : null}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Watchlist Summary</h3>
          <div className="mt-4 space-y-3">
            {watchlist.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={assetDetailRoute(marketMode, item.ticker)}
                className="flex items-center justify-between rounded-lg border border-line bg-white/[0.03] p-3 hover:bg-white/[0.06]"
              >
                <div>
                  <p className="font-semibold text-stone-100">{item.ticker}</p>
                  <p className="text-sm text-stone-500">{item.companyName}</p>
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-sm text-stone-300">{item.score}</span>
              </Link>
            ))}
            {!watchlist.length ? <EmptyState icon={Star} title="Watchlist Empty" description={`Save ${assetLabel} from the scanner for follow-up research.`} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
