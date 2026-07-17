import { Activity, AlertTriangle, Brain, Clock3, Cpu, DollarSign, Gauge, Play, Power, RadioTower, ShieldOff, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { SafetyBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";
import type { AIStatus, AutomationStatus, AnalysisEngineStatus } from "../lib/types";

export function AutomationCenterPage() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    const [automationData, aiData, analysisData] = await Promise.all([api.automationStatus(), api.aiStatus(), api.analysisEngineStatus()]);
    setStatus(automationData);
    setAiStatus(aiData);
    setAnalysisStatus(analysisData);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function runJob(name: string) {
    const result = await api.runAutomationJob(name);
    setNotice(result.summary);
    await load();
  }

  async function togglePaperTrading() {
    if (!status) return;
    await api.setAutoPaperTrading(!status.autoPaperTrading);
    await load();
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!status) return <EmptyState icon={RadioTower} title="Automation unavailable" description="The backend did not return worker status." />;
  const workerHeartbeat = aiStatus?.workerHeartbeatAt ?? status.workerHeartbeatAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Continuous research engine</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Automation Center</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label="AUTO SCAN ON" tone="green" />
          <SafetyBadge label="PAPER TRADING ONLY" tone="purple" />
          <SafetyBadge label="REAL TRADING DISABLED" tone="red" />
        </div>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Market scanner" value={status.marketScannerStatus} icon={RadioTower} tone="green" />
        <StatCard label="Last scan" value={status.lastScanTime ? dateShort(status.lastScanTime) : "None"} icon={Play} tone="neutral" />
        <StatCard label="Next scan" value={status.nextScanTime ? dateShort(status.nextScanTime) : "Queued"} icon={Power} tone="amber" />
        <StatCard label="Open paper trades" value={status.openPaperTrades} icon={WalletCards} tone="purple" />
      </div>

      {analysisStatus ? (
        <section className="rounded-lg border border-mint/25 bg-mint/10 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Professional analysis engine</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-50">TypeScript Analysis Engine</h3>
              <p className="mt-1 text-sm text-stone-400">
                Technical indicators, multi-timeframe analysis, strategy backtests, execution simulation, and risk checks run in the Node.js backend.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SafetyBadge label="TYPESCRIPT ENGINE ACTIVE" tone="green" />
              <SafetyBadge label="NO PYTHON REQUIRED" tone="green" />
              <SafetyBadge label="PAPER TRADING ONLY" tone="purple" />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Connection"
              value={analysisStatus.connected ? "Active" : "Unavailable"}
              detail="Node.js and TypeScript"
              icon={Cpu}
              tone="green"
            />
            <StatCard label="Last analysis" value={analysisStatus.lastAnalysisAt ? dateShort(analysisStatus.lastAnalysisAt) : "None yet"} icon={Clock3} tone="neutral" />
            <StatCard label="Indicators" value={analysisStatus.engines.indicators} icon={Gauge} tone="green" />
            <StatCard label="Backtesting" value={analysisStatus.engines.backtesting} icon={Activity} tone="green" />
            <StatCard label="Risk engine" value={analysisStatus.engines.risk} icon={ShieldOff} tone="green" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-mint/20 bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Stock Automation</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto stock scan</span><span className="font-semibold text-mint">ON</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto stock research</span><span className="font-semibold text-mint">ON</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto stock paper trading</span><span className={status.autoPaperTrading ? "font-semibold text-mint" : "font-semibold text-caution"}>{status.autoPaperTrading ? "ON" : "OFF"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Last stock scan</span><span className="font-semibold text-stone-100">{status.lastScanTime ? dateShort(status.lastScanTime) : "Waiting"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Stock worker heartbeat</span><span className="font-semibold text-stone-100">{workerHeartbeat ? dateShort(workerHeartbeat) : "Waiting"}</span></div>
          </div>
        </section>

        <section className="rounded-lg border border-berry/25 bg-panel/88 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-stone-50">Crypto Automation</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto crypto scan</span><span className="font-semibold text-mint">ON</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto crypto research</span><span className="font-semibold text-mint">ON</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Auto crypto paper trading</span><span className={status.autoPaperTrading ? "font-semibold text-mint" : "font-semibold text-caution"}>{status.autoPaperTrading ? "ON" : "OFF"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Next crypto scan</span><span className="font-semibold text-stone-100">{status.nextScanTime ? dateShort(status.nextScanTime) : "Queued"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-stone-500">Crypto worker heartbeat</span><span className="font-semibold text-stone-100">{workerHeartbeat ? dateShort(workerHeartbeat) : "Waiting"}</span></div>
          </div>
        </section>

        <section className="rounded-lg border border-danger/25 bg-danger/10 p-5 shadow-glow">
          <h3 className="text-lg font-semibold text-red-100">Global Safety</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-red-100/70">Real stock trading</span><span className="font-semibold text-red-100">DISABLED</span></div>
            <div className="flex justify-between gap-3"><span className="text-red-100/70">Real crypto trading</span><span className="font-semibold text-red-100">DISABLED</span></div>
            <div className="flex justify-between gap-3"><span className="text-red-100/70">Broker mode</span><span className="font-semibold text-red-100">Paper only</span></div>
            <div className="flex justify-between gap-3"><span className="text-red-100/70">Technical fallback</span><span className="font-semibold text-red-100">{aiStatus?.config.technicalFallbackEnabled ? "Enabled" : "Off"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-red-100/70">AI mode</span><span className="font-semibold text-red-100">{aiStatus?.mode ?? "Checking"}</span></div>
          </div>
        </section>
      </div>

      {aiStatus ? (
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-stone-50">AI provider router</h3>
              <p className="mt-1 text-sm text-stone-400">OpenAI, Mistral, optional remote models, optional Ollama, then deterministic technical-only research if providers are unavailable.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SafetyBadge label={aiStatus.mode} tone={aiStatus.mode === "TECHNICAL_ONLY" ? "amber" : aiStatus.mode === "REMOTE_LOCAL_MODEL" || aiStatus.mode === "OLLAMA_LOCAL" ? "purple" : "green"} />
              {aiStatus.lastAIError ? <SafetyBadge label="Provider unavailable" tone="red" /> : null}
              {aiStatus.config.paperTradingEnabled ? <SafetyBadge label="Paper trading enabled" tone="green" /> : <SafetyBadge label="Paper trading off" tone="red" />}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Primary provider" value={aiStatus.primaryProviderStatus} detail={aiStatus.config.openaiModel} icon={Brain} tone={aiStatus.primaryProviderStatus === "Unavailable" ? "red" : "green"} />
            <StatCard label="Fallback provider" value={aiStatus.fallbackProviderStatus} detail={aiStatus.config.mistralModel} icon={Activity} tone={aiStatus.fallbackProviderStatus === "Unavailable" ? "red" : "purple"} />
            <StatCard label="Remote model" value={aiStatus.remoteProviderStatus ?? "Not configured"} detail={aiStatus.config.localModelModel ?? aiStatus.config.localModelProvider} icon={Brain} tone={aiStatus.remoteProviderStatus === "Healthy" ? "green" : "neutral"} />
            <StatCard label="Ollama" value={aiStatus.ollamaProviderStatus ?? "Disabled"} detail={aiStatus.config.ollamaModel} icon={Clock3} tone={aiStatus.ollamaProviderStatus === "Healthy" ? "green" : "amber"} />
            <StatCard label="Calls this hour" value={`${aiStatus.hourlyCalls}/${aiStatus.config.maxCallsPerHour}`} icon={Clock3} tone="neutral" />
            <StatCard label="Cost today" value={`$${aiStatus.dailyEstimatedCostUsd.toFixed(4)}`} detail={`Budget $${aiStatus.dailyBudgetUsd.toFixed(2)}`} icon={DollarSign} tone="amber" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-line bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Calls today</p>
              <p className="mt-2 text-xl font-semibold text-stone-50">{aiStatus.dailyCalls}/{aiStatus.config.maxCallsPerDay}</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Cache hit rate</p>
              <p className="mt-2 text-xl font-semibold text-stone-50">{aiStatus.cacheHitRate}%</p>
            </div>
            <div className="rounded-lg border border-line bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Worker heartbeat</p>
              <p className="mt-2 text-xl font-semibold text-stone-50">{workerHeartbeat ? dateShort(workerHeartbeat) : "Waiting"}</p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-line bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-stone-50">Provider diagnostics</h4>
                <p className="mt-1 text-sm text-stone-400">Safe Render-side status. No API keys are shown.</p>
              </div>
              <SafetyBadge label="Secrets hidden" tone="green" />
            </div>
            <div className="mt-4 grid gap-3">
              {aiStatus.providerDiagnostics.map((provider) => (
                <div key={provider.provider} className="rounded-lg border border-line bg-panel/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold uppercase text-stone-100">{provider.provider}</span>
                      <SafetyBadge
                        label={provider.status}
                        tone={provider.status === "Healthy" ? "green" : provider.status === "Unavailable" ? "red" : provider.status === "Not checked" ? "amber" : "neutral"}
                      />
                      {provider.lastErrorCode ? <SafetyBadge label={provider.lastErrorCode} tone={provider.lastErrorCode === "MISSING_API_KEY" ? "amber" : "red"} /> : null}
                    </div>
                    <span className="text-xs text-stone-500">{provider.model}</span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-stone-400">{provider.hint}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-600">
                    {provider.lastSuccessAt ? <span>Last success: {dateShort(provider.lastSuccessAt)}</span> : null}
                    {provider.lastFailureAt ? <span>Last failure: {dateShort(provider.lastFailureAt)}</span> : null}
                    {provider.disabledUntil ? <span>Cooldown until: {dateShort(provider.disabledUntil)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {aiStatus.technicalOnlyActive ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-caution/25 bg-caution/10 p-3 text-sm text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              AI unavailable — technical-only analysis used when deterministic rules allow it.
            </div>
          ) : null}

          {aiStatus.recentAnalyses.length ? (
            <div className="mt-5 overflow-x-auto scrollbar-thin">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-stone-500">
                  <tr>
                    <th className="py-3 pr-4">Symbol</th>
                    <th className="py-3 pr-4">Provider</th>
                    <th className="py-3 pr-4">Recommendation</th>
                    <th className="py-3 pr-4">Confidence</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {aiStatus.recentAnalyses.slice(0, 6).map((analysis) => (
                    <tr key={analysis.id}>
                      <td className="py-3 pr-4 font-semibold text-stone-100">{analysis.symbol ?? "SYSTEM"}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          <SafetyBadge
                            label={analysis.technicalOnly ? "TECHNICAL_ONLY" : analysis.provider === "remote_local" ? "REMOTE_LOCAL_MODEL" : analysis.provider === "ollama" ? "OLLAMA_LOCAL" : "AI_ENHANCED"}
                            tone={analysis.technicalOnly ? "amber" : analysis.provider === "mistral" || analysis.provider === "remote_local" || analysis.provider === "ollama" ? "purple" : "green"}
                          />
                          {analysis.cached ? <SafetyBadge label="Cached" tone="neutral" /> : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-stone-300">{analysis.recommendation}</td>
                      <td className="py-3 pr-4 text-stone-300">{analysis.confidence}%</td>
                      <td className="py-3 pr-4 text-stone-400">{analysis.status}</td>
                      <td className="py-3 pr-4 text-stone-500">{dateShort(analysis.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-50">Auto paper trading</h3>
            <p className="mt-1 text-sm text-stone-400">Automatic simulated trades can open only after risk-engine approval.</p>
          </div>
          <button
            className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${
              status.autoPaperTrading ? "border border-mint/30 bg-mint/10 text-mint" : "border border-line bg-white/5 text-stone-200"
            }`}
            onClick={togglePaperTrading}
          >
            <Power className="h-4 w-4" />
            {status.autoPaperTrading ? "Auto Paper Trading ON" : "Auto Paper Trading OFF"}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">
          <ShieldOff className="h-4 w-4" />
          Real-money trading is blocked by design.
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <h3 className="text-lg font-semibold text-stone-50">Scheduled jobs</h3>
        <div className="mt-4 overflow-x-auto scrollbar-thin">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-stone-500">
              <tr>
                <th className="py-3 pr-4">Job</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Cadence</th>
                <th className="py-3 pr-4">Last run</th>
                <th className="py-3 pr-4">Next run</th>
                <th className="py-3 pr-4">Runs</th>
                <th className="py-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {status.jobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-4 pr-4 font-semibold text-stone-100">{job.name}</td>
                  <td className="py-4 pr-4 text-stone-300">{job.status}</td>
                  <td className="py-4 pr-4 text-stone-400">{job.cadence}</td>
                  <td className="py-4 pr-4 text-stone-400">{job.lastRunAt ? dateShort(job.lastRunAt) : "Not yet"}</td>
                  <td className="py-4 pr-4 text-stone-400">{job.nextRunAt ? dateShort(job.nextRunAt) : "Queued"}</td>
                  <td className="py-4 pr-4 text-stone-300">{job.runCount}</td>
                  <td className="py-4 pr-4">
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-stone-200 hover:bg-white/6"
                      onClick={() => runJob(job.name)}
                    >
                      <Play className="h-4 w-4" />
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
