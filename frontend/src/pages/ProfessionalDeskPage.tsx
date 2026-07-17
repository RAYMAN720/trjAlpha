import {
  Activity,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Gauge,
  PlayCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { DecisionBadge, SafetyBadge, ScoreBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { dateShort, euro, percent } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { CommitteeVote, ProfessionalDesk } from "../lib/types";

function regimeTone(regime: string): "green" | "amber" | "red" | "purple" | "neutral" {
  if (regime === "BULL_TREND") return "green";
  if (regime === "BULL_VOLATILE" || regime === "SIDEWAYS") return "amber";
  if (regime === "BEAR_TREND" || regime === "RISK_OFF") return "red";
  return "neutral";
}

function riskTone(state: string): "green" | "amber" | "red" | "purple" | "neutral" {
  if (state === "NORMAL") return "green";
  if (state === "CAUTION" || state === "REDUCED_SIZE") return "amber";
  if (state === "PAUSED" || state === "LOCKED") return "red";
  return "neutral";
}

function voteTone(vote: CommitteeVote): "green" | "amber" | "red" | "neutral" {
  if (vote.veto) return "red";
  if (vote.passed) return "green";
  if (vote.score >= 55) return "amber";
  return "neutral";
}

function numberOrDash(value: number | null, suffix = "") {
  return value === null ? "—" : `${value.toFixed(2)}${suffix}`;
}

export function ProfessionalDeskPage() {
  const { marketMode } = useMarketMode();
  const [desk, setDesk] = useState<ProfessionalDesk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const data = await api.professionalDesk(marketMode);
    setDesk(data);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setLoading(false));
  }, [marketMode]);

  async function toggleEntryControl() {
    if (!desk) return;
    const halting = desk.control.newEntriesEnabled && !desk.control.emergencyHalt;
    if (halting && !window.confirm("Halt all new automatic paper-trade entries? Open positions will continue to be monitored.")) return;

    setBusy(true);
    setNotice("");
    setError("");
    try {
      if (halting) {
        await api.haltProfessionalEntries();
        setNotice("New paper-trade entries are halted. Existing positions remain under risk management.");
      } else {
        await api.resumeProfessionalEntries();
        setNotice("New paper-trade entries were re-enabled after the manual safety review.");
      }
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshShadow() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = await api.refreshShadowDesk(marketMode);
      setNotice(`Shadow desk refreshed ${result.refresh.updated} trade(s) and closed ${result.refresh.closed}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={8} />;
  if (!desk) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Professional Desk unavailable"
        description={error || "The backend did not return professional trading controls."}
      />
    );
  }

  const entryHalted = desk.control.emergencyHalt || !desk.control.newEntriesEnabled;
  const latestDecision = desk.decisions[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Institutional-style paper process</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Professional Trading Desk</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
            Six independent desks must agree before a simulated position can open. Risk and data controls have veto power; AI research cannot bypass them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label="PAPER ONLY" tone="purple" />
          <SafetyBadge label="REAL TRADING DISABLED" tone="red" />
          <SafetyBadge label={entryHalted ? "NEW ENTRIES HALTED" : "ENTRY CONTROL ACTIVE"} tone={entryHalted ? "red" : "green"} />
        </div>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</div> : null}

      <section className={`rounded-lg border p-5 shadow-glow ${entryHalted ? "border-danger/30 bg-danger/10" : "border-mint/25 bg-mint/10"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {entryHalted ? <Ban className="h-5 w-5 text-red-200" /> : <ShieldCheck className="h-5 w-5 text-mint" />}
              <h3 className="text-lg font-semibold text-stone-50">Emergency entry control</h3>
            </div>
            <p className="mt-2 text-sm text-stone-300">
              {entryHalted
                ? desk.control.reason || "New entries are blocked by the professional safety control."
                : "New positions may open only after strategy, risk, regime, execution and data approval."}
            </p>
            <p className="mt-1 text-xs text-stone-500">This control never enables real-money trading.</p>
          </div>
          <button
            className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              entryHalted ? "border-mint/30 bg-mint/12 text-mint" : "border-danger/30 bg-danger/12 text-red-100"
            }`}
            onClick={toggleEntryControl}
            disabled={busy}
          >
            {entryHalted ? <PlayCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {entryHalted ? "Resume Paper Entries" : "Halt New Entries"}
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Market regime"
          value={desk.regime.regime.replace(/_/g, " ")}
          detail={`${desk.regime.longScore}/100 long score · ${desk.regime.confidence}% confidence`}
          icon={TrendingUp}
          tone={regimeTone(desk.regime.regime)}
        />
        <StatCard
          label="Risk state"
          value={desk.risk.state}
          detail={`${desk.risk.openTrades} open · ${desk.risk.lossesInRow} consecutive losses`}
          icon={Shield}
          tone={riskTone(desk.risk.state)}
        />
        <StatCard
          label="Execution drag"
          value={`${desk.execution.averageTotalBps.toFixed(2)} bps`}
          detail={`${desk.execution.count} modeled fills · ${desk.execution.partialFillRate.toFixed(1)}% partial`}
          icon={Gauge}
          tone={desk.execution.averageTotalBps <= 8 ? "green" : desk.execution.averageTotalBps <= 15 ? "amber" : "red"}
        />
        <StatCard
          label="Shadow strategy"
          value={`PF ${desk.shadow.profitFactor.toFixed(2)}`}
          detail={`${desk.shadow.closed} closed · ${desk.shadow.winRate.toFixed(1)}% win rate`}
          icon={Bot}
          tone={desk.shadow.profitFactor >= 1.3 ? "green" : desk.shadow.closed ? "amber" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Regime detector</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-50">Current market conditions</h3>
            </div>
            <SafetyBadge label={desk.regime.regime.replace(/_/g, " ")} tone={regimeTone(desk.regime.regime)} />
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-300">{desk.regime.summary}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Advancers</p><p className="mt-1 font-semibold text-stone-100">{desk.regime.metrics.advancersPercent.toFixed(1)}%</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">20d return</p><p className="mt-1 font-semibold text-stone-100">{numberOrDash(desk.regime.metrics.benchmarkReturn20Percent, "%")}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">20d volatility</p><p className="mt-1 font-semibold text-stone-100">{numberOrDash(desk.regime.metrics.benchmarkVolatility20Percent, "%")}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Tracked assets</p><p className="mt-1 font-semibold text-stone-100">{desk.regime.metrics.trackedAssets}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Size multiplier</p><p className="mt-1 font-semibold text-stone-100">{desk.regime.positionSizeMultiplier.toFixed(2)}×</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Long breakouts</p><p className={`mt-1 font-semibold ${desk.regime.allowLongBreakouts ? "text-mint" : "text-caution"}`}>{desk.regime.allowLongBreakouts ? "Allowed" : "Blocked"}</p></div>
          </div>
          {desk.regime.warnings.length ? (
            <div className="mt-4 space-y-2">
              {desk.regime.warnings.map((warning) => <p key={warning} className="rounded-lg border border-caution/20 bg-caution/8 p-3 text-xs leading-5 text-amber-100">{warning}</p>)}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Capital protection</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-50">Risk circuit breakers</h3>
            </div>
            <SafetyBadge label={desk.risk.state} tone={riskTone(desk.risk.state)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Daily P/L</p><p className={desk.risk.dailyPl >= 0 ? "mt-1 font-semibold text-mint" : "mt-1 font-semibold text-red-200"}>{euro.format(desk.risk.dailyPl)}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Weekly P/L</p><p className={desk.risk.weeklyPl >= 0 ? "mt-1 font-semibold text-mint" : "mt-1 font-semibold text-red-200"}>{euro.format(desk.risk.weeklyPl)}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Drawdown</p><p className="mt-1 font-semibold text-stone-100">{desk.risk.currentDrawdownPercent.toFixed(2)}%</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Daily limit</p><p className="mt-1 font-semibold text-stone-100">{euro.format(desk.risk.dailyLossLimit)}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Trades today</p><p className="mt-1 font-semibold text-stone-100">{desk.risk.tradesOpenedToday}/{desk.risk.maxDailyTrades}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Size multiplier</p><p className="mt-1 font-semibold text-stone-100">{desk.risk.reducedSizeMultiplier.toFixed(2)}×</p></div>
          </div>
          <div className="mt-4 space-y-2">
            {desk.risk.reasons.map((reason) => (
              <div key={reason} className="flex gap-2 rounded-lg border border-line bg-white/[0.025] p-3 text-sm text-stone-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Six-desk review</p>
            <h3 className="mt-1 text-lg font-semibold text-stone-50">Recent committee decisions</h3>
            <p className="mt-1 text-sm text-stone-400">Strategy, risk, regime, execution, data and AI research vote independently.</p>
          </div>
          {latestDecision ? <DecisionBadge decision={latestDecision.decision} /> : null}
        </div>

        {desk.decisions.length ? (
          <div className="mt-4 space-y-4">
            {desk.decisions.slice(0, 10).map((decision) => (
              <article key={decision.id} className="rounded-lg border border-line bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-stone-50">{decision.ticker}</p>
                      <DecisionBadge decision={decision.decision} />
                      {decision.shadowOnly ? <SafetyBadge label="SHADOW ONLY" tone="purple" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-stone-500">{decision.strategyName} · {decision.marketRegime.replace(/_/g, " ")} · {dateShort(decision.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ScoreBadge score={decision.committeeScore} />
                    <span className="text-xs text-stone-500">{decision.confidence}% confidence</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  {decision.votes.map((vote) => (
                    <div key={vote.desk} className="rounded-lg border border-line bg-black/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-stone-400">{vote.desk.replace(/_/g, " ")}</p>
                        <SafetyBadge label={vote.veto ? "VETO" : vote.passed ? "PASS" : "NO"} tone={voteTone(vote)} />
                      </div>
                      <p className="mt-2 text-lg font-semibold text-stone-100">{Math.round(vote.score)}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-stone-500">{vote.reason}</p>
                    </div>
                  ))}
                </div>
                {decision.reasons.length ? <p className="mt-3 text-xs leading-5 text-caution">{decision.reasons.join(" · ")}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-stone-500">No committee decision has been recorded yet.</p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Realistic fills</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-50">Execution simulator</h3>
            </div>
            <BarChart3 className="h-5 w-5 text-mint" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Avg slippage</p><p className="mt-1 font-semibold text-stone-100">{desk.execution.averageSlippageBps.toFixed(2)} bps</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Fees</p><p className="mt-1 font-semibold text-stone-100">{euro.format(desk.execution.totalFees)}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Partial fills</p><p className="mt-1 font-semibold text-stone-100">{desk.execution.partialFillRate.toFixed(1)}%</p></div>
          </div>
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-[0.12em] text-stone-500">
                <tr><th className="py-3 pr-3">Asset</th><th className="py-3 pr-3">Side</th><th className="py-3 pr-3">Grade</th><th className="py-3 pr-3">Fill</th><th className="py-3 pr-3">Drag</th><th className="py-3 pr-3">Fee</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {desk.execution.recent.slice(0, 10).map((fill) => (
                  <tr key={fill.id}>
                    <td className="py-3 pr-3 font-semibold text-stone-100">{fill.ticker}<p className="text-xs font-normal text-stone-600">{dateShort(fill.createdAt)}</p></td>
                    <td className={fill.side === "BUY" ? "py-3 pr-3 text-mint" : "py-3 pr-3 text-purple-200"}>{fill.side}</td>
                    <td className="py-3 pr-3"><SafetyBadge label={fill.qualityGrade} tone={fill.qualityGrade === "A" || fill.qualityGrade === "B" ? "green" : fill.qualityGrade === "C" ? "amber" : "red"} /></td>
                    <td className="py-3 pr-3 text-stone-300">{fill.filledQuantity}/{fill.requestedQuantity} @ {fill.fillPrice.toFixed(2)}</td>
                    <td className="py-3 pr-3 text-stone-300">{fill.totalExecutionBps.toFixed(2)} bps</td>
                    <td className="py-3 pr-3 text-stone-300">{euro.format(fill.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Safe experimentation</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-50">Shadow strategy desk</h3>
              <p className="mt-1 text-sm text-stone-400">Rejected but promising setups are tracked without using the main paper account.</p>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-stone-200 hover:bg-white/6 disabled:opacity-50" onClick={refreshShadow} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Open</p><p className="mt-1 font-semibold text-stone-100">{desk.shadow.open}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Closed</p><p className="mt-1 font-semibold text-stone-100">{desk.shadow.closed}</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Win rate</p><p className="mt-1 font-semibold text-stone-100">{desk.shadow.winRate.toFixed(1)}%</p></div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Net P/L</p><p className={desk.shadow.totalProfitLoss >= 0 ? "mt-1 font-semibold text-mint" : "mt-1 font-semibold text-red-200"}>{euro.format(desk.shadow.totalProfitLoss)}</p></div>
          </div>
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-[0.12em] text-stone-500">
                <tr><th className="py-3 pr-3">Asset</th><th className="py-3 pr-3">Status</th><th className="py-3 pr-3">Score</th><th className="py-3 pr-3">Entry</th><th className="py-3 pr-3">P/L</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {desk.shadow.trades.slice(0, 10).map((trade) => (
                  <tr key={trade.id}>
                    <td className="py-3 pr-3 font-semibold text-stone-100">{trade.ticker}<p className="text-xs font-normal text-stone-600">{trade.strategyName}</p></td>
                    <td className="py-3 pr-3"><SafetyBadge label={trade.status} tone={trade.status === "Open" ? "purple" : trade.profitLoss >= 0 ? "green" : "red"} /></td>
                    <td className="py-3 pr-3"><ScoreBadge score={trade.committeeScore} /></td>
                    <td className="py-3 pr-3 text-stone-300">{trade.entryPrice.toFixed(2)} → {trade.currentPrice.toFixed(2)}</td>
                    <td className={trade.profitLoss >= 0 ? "py-3 pr-3 font-semibold text-mint" : "py-3 pr-3 font-semibold text-red-200"}>{euro.format(trade.profitLoss)}<p className="text-xs font-normal opacity-75">{percent(trade.profitLossPercent)}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-berry/25 bg-berry/8 p-4 text-sm text-purple-100">
        <div className="flex gap-3">
          <WalletCards className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-6">
            This dashboard measures process quality, not guaranteed profitability. TradePilot remains a simulation platform: no leverage, no margin and no real broker execution are enabled.
          </p>
        </div>
      </section>
    </div>
  );
}
