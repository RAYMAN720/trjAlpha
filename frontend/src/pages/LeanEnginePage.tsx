import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Play, RefreshCw, Square } from "lucide-react";
import { api } from "../lib/api";
import type { LeanEngineStatus, LeanJob } from "../lib/types";

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function LeanEnginePage() {
  const [status, setStatus] = useState<LeanEngineStatus | null>(null);
  const [jobs, setJobs] = useState<LeanJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2018-01-01");
  const [endDate, setEndDate] = useState(dateInput(new Date(Date.now() - 86_400_000)));
  const [symbols, setSymbols] = useState("AAPL,MSFT,NVDA,AMZN,META,GOOGL,AVGO,AMD");

  const symbolList = useMemo(
    () => symbols.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean),
    [symbols]
  );

  async function refresh() {
    setError(null);
    try {
      const [nextStatus, nextJobs] = await Promise.all([api.leanStatus(), api.leanJobs()]);
      setStatus(nextStatus);
      setJobs(nextJobs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load LEAN status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function runBacktest() {
    setBusy(true);
    setError(null);
    try {
      await api.runLeanBacktest({ startDate, endDate, initialCash: 100_000, benchmark: "SPY", symbols: symbolList });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start backtest.");
    } finally {
      setBusy(false);
    }
  }

  async function startPaper() {
    setBusy(true);
    setError(null);
    try {
      await api.startLeanPaper({ initialCash: 100_000, symbols: symbolList });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start LEAN paper trading.");
    } finally {
      setBusy(false);
    }
  }

  async function stopJob(id: string) {
    setBusy(true);
    try {
      await api.stopLeanJob(id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to stop LEAN job.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-line bg-panel p-6 text-stone-400">Loading LEAN engine…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Cpu className="h-7 w-7 text-mint" />
            <h2 className="text-2xl font-semibold text-stone-50">LEAN Engine Center</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
            QuantConnect LEAN runs the same C# algorithm for historical backtests and Alpaca paper execution. TradePilot remains the product, research and safety layer.
          </p>
        </div>
        <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-stone-300 hover:bg-white/5">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Engine</p>
          <p className="mt-2 text-lg font-semibold text-stone-100">{status?.provider}</p>
          <p className="mt-2 text-sm text-stone-400">{status?.engineImage}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Connection</p>
          <div className="mt-2 flex items-center gap-2 font-semibold">
            {status?.reachable ? <CheckCircle2 className="h-5 w-5 text-mint" /> : <AlertTriangle className="h-5 w-5 text-amber-300" />}
            <span>{status?.reachable ? "Gateway online" : "Gateway unavailable"}</span>
          </div>
          <p className="mt-2 text-sm text-stone-400">{status?.warning ?? "Ready for LEAN jobs."}</p>
        </div>
        <div className="rounded-xl border border-mint/25 bg-mint/10 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-mint/70">Safety mode</p>
          <p className="mt-2 text-lg font-semibold text-mint">Paper only</p>
          <p className="mt-2 text-sm text-mint/75">Live-money execution is disabled in both TradePilot and the gateway.</p>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel p-5">
        <h3 className="text-lg font-semibold">Run the shared algorithm</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-stone-400">Start date<input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-stone-100" /></label>
          <label className="text-sm text-stone-400">End date<input value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-stone-100" /></label>
        </div>
        <label className="mt-4 block text-sm text-stone-400">Stock universe<input value={symbols} onChange={(event) => setSymbols(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-stone-100" /></label>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={busy || !status?.reachable} onClick={() => void runBacktest()} className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4" /> Run LEAN backtest
          </button>
          <button disabled={busy || !status?.reachable} onClick={() => void startPaper()} className="inline-flex items-center gap-2 rounded-lg border border-mint/40 px-4 py-2 font-semibold text-mint disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4" /> Start Alpaca paper engine
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel p-5">
        <h3 className="text-lg font-semibold">LEAN architecture enabled</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {status?.capabilities.map((capability) => (
            <div key={capability.key} className="rounded-lg border border-line bg-ink/50 p-4">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold text-stone-100">{capability.name}</p><span className="rounded-full border border-line px-2 py-1 text-[0.65rem] font-semibold text-stone-400">{capability.implementation}</span></div>
              <p className="mt-2 text-sm leading-5 text-stone-400">{capability.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel p-5">
        <h3 className="text-lg font-semibold">Engine jobs</h3>
        <div className="mt-4 space-y-3">
          {jobs.length ? jobs.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-ink/50 p-4">
              <div><p className="font-semibold text-stone-100">{job.mode} · {job.status}</p><p className="mt-1 text-xs text-stone-500">{job.id} · {new Date(job.createdAt).toLocaleString()}</p>{job.error ? <p className="mt-2 text-sm text-red-300">{job.error}</p> : null}</div>
              {job.status === "RUNNING" ? <button onClick={() => void stopJob(job.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-400/40 px-3 py-2 text-sm text-red-200"><Square className="h-4 w-4" /> Stop</button> : null}
            </div>
          )) : <p className="text-sm text-stone-500">No LEAN jobs have been submitted.</p>}
        </div>
      </section>
    </div>
  );
}
