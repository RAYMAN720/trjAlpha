import { BookOpenCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SafetyBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import { useMarketMode } from "../lib/marketMode";
import type { PlaybookStatus } from "../lib/types";

export function PlaybooksPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [playbooks, setPlaybooks] = useState<PlaybookStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.playbooksStatus(marketMode)
      .then((data) => setPlaybooks(data.playbooks))
      .finally(() => setLoading(false));
  }, [marketMode]);

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">{marketLabel} strategy lab</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Professional Playbooks</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-400">Strategies must prove themselves through backtesting and paper trading. Real trading remains disabled.</p>
        </div>
        <SafetyBadge label="PAPER ONLY" tone="green" />
      </div>

      {!playbooks.length ? <EmptyState icon={BookOpenCheck} title="No playbooks" description="Playbooks are still loading." /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {playbooks.map((playbook) => (
          <section key={playbook.name} className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-50">{playbook.name}</h3>
                <p className="mt-1 text-sm text-stone-500">Minimum score {playbook.minimumScore}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SafetyBadge label={playbook.proofLevel} tone={playbook.proofLevel === "PAPER_PROVEN" ? "green" : playbook.proofLevel === "DISABLED" ? "red" : "amber"} />
                <SafetyBadge label={playbook.status} tone={playbook.status === "Weak" || playbook.status === "Disabled" ? "red" : playbook.status === "Enabled" ? "green" : "purple"} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Win rate</p><p className="mt-1 font-semibold text-stone-100">{playbook.winRate.toFixed(1)}%</p></div>
              <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Profit factor</p><p className="mt-1 font-semibold text-stone-100">{playbook.profitFactor.toFixed(2)}</p></div>
              <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Max drawdown</p><p className="mt-1 font-semibold text-stone-100">{playbook.maxDrawdown.toFixed(1)}</p></div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Setup conditions</p>
                <ul className="mt-2 space-y-1 text-sm text-stone-300">
                  {playbook.setupConditions.slice(0, 4).map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-stone-500">No-trade conditions</p>
                <ul className="mt-2 space-y-1 text-sm text-stone-300">
                  {playbook.noTradeConditions.slice(0, 4).map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
