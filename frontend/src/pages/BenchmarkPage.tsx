import { Medal } from "lucide-react";
import { useEffect, useState } from "react";
import { SafetyBadge } from "../components/Badges";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import type { BenchmarkBucket, BenchmarkStatus } from "../lib/types";

function BenchmarkCard({ title, bucket }: { title: string; bucket: BenchmarkBucket }) {
  const tone = bucket.level.includes("5-year") || bucket.level.includes("3-year") ? "green" : bucket.level.includes("Not") || bucket.level.includes("Below") ? "amber" : "purple";

  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-stone-50">{title}</h3>
          <p className="mt-1 text-sm text-stone-500">{bucket.closedTrades} closed paper trades</p>
        </div>
        <SafetyBadge label={bucket.level} tone={tone} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Win rate</p><p className="mt-1 font-semibold text-stone-100">{bucket.winRate.toFixed(1)}%</p></div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Profit factor</p><p className="mt-1 font-semibold text-stone-100">{bucket.profitFactor.toFixed(2)}</p></div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-3"><p className="text-stone-500">Drawdown</p><p className="mt-1 font-semibold text-stone-100">{bucket.maxDrawdown.toFixed(1)}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {bucket.badges.map((badge) => <SafetyBadge key={badge} label={badge} tone={badge.includes("NOT") ? "amber" : "purple"} />)}
      </div>
    </section>
  );
}

export function BenchmarkPage() {
  const [status, setStatus] = useState<BenchmarkStatus | null>(null);

  useEffect(() => {
    api.benchmarkStatus().then(setStatus);
  }, []);

  if (!status) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Process benchmark</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Beginner vs 5-Year Trader Process</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-400">{status.overall.disclaimer}</p>
        </div>
        <Medal className="h-7 w-7 text-mint" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <BenchmarkCard title="Stocks Benchmark" bucket={status.stocks} />
        <BenchmarkCard title="Crypto Benchmark" bucket={status.crypto} />
        <BenchmarkCard title="Overall Benchmark" bucket={status.overall} />
      </div>
    </div>
  );
}
