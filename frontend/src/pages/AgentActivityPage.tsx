import { Bot, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";
import type { MarketMode } from "../lib/marketMode";
import type { AgentRun } from "../lib/types";

export function AgentActivityPage() {
  const [filter, setFilter] = useState<"all" | MarketMode>("all");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .agentRuns(filter === "all" ? undefined : filter)
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Structured agent logs</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">Agent Activity</h2>
      </div>

      <div className="inline-flex rounded-lg border border-line bg-white/[0.04] p-1">
        {[
          ["all", "All"],
          ["stocks", "Stocks"],
          ["crypto", "Crypto"]
        ].map(([value, label]) => (
          <button
            key={value}
            className={`h-9 rounded-md px-3 text-sm font-semibold ${filter === value ? "bg-mint text-ink" : "text-stone-400 hover:bg-white/6 hover:text-stone-100"}`}
            onClick={() => setFilter(value as "all" | MarketMode)}
          >
            {label}
          </button>
        ))}
      </div>

      {runs.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel/88 scrollbar-thin shadow-glow">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-line bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-stone-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Output summary</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-4 font-semibold text-stone-50">{run.agentName}</td>
                  <td className="px-4 py-4 text-stone-300">{run.assetType === "crypto" ? "Crypto" : "Stocks"}</td>
                  <td className="px-4 py-4 text-stone-400">{run.jobName ?? "Manual"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      run.status === "Success" ? "border-mint/30 bg-mint/10 text-mint" : "border-danger/30 bg-danger/10 text-red-200"
                    }`}>
                      {run.status === "Success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-stone-300">{run.inputTicker ?? "System"}</td>
                  <td className="max-w-xl px-4 py-4 text-stone-300">{run.outputSummary}</td>
                  <td className="px-4 py-4 text-stone-500">{dateShort(run.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Bot} title="No agent runs yet" description="Run an automation job to see structured agent activity." />
      )}
    </div>
  );
}
