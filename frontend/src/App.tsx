import { Activity, BarChart3, Bell, CandlestickChart, CircleDollarSign, Layers3, ShieldCheck, Sparkles, WalletCards } from "lucide-react";

const prototypeMetrics = [
  { label: "Frontend mode", value: "Active", helper: "No backend calls", icon: Layers3 },
  { label: "Paper system", value: "Design only", helper: "Ready for rebuild", icon: WalletCards },
  { label: "Real trading", value: "Disabled", helper: "No broker execution", icon: ShieldCheck },
  { label: "Data source", value: "Mock UI", helper: "Static prototype", icon: BarChart3 }
];

const rebuildModules = [
  "Market dashboard",
  "Crypto scanner",
  "Paper trading terminal",
  "Research reports",
  "Learning dashboard",
  "Alerts center"
];

const mockOpportunities = [
  { symbol: "BTC", name: "Bitcoin", score: 82, decision: "Watch", risk: "Medium", change: "+1.8%" },
  { symbol: "ETH", name: "Ethereum", score: 78, decision: "Research", risk: "Medium", change: "+2.4%" },
  { symbol: "SOL", name: "Solana", score: 71, decision: "Wait", risk: "High", change: "+4.9%" }
];

function routeLabel(pathname: string) {
  if (pathname.includes("crypto")) return "Crypto workspace";
  if (pathname.includes("stocks")) return "Stock workspace";
  if (pathname.includes("paper-trading")) return "Paper trading workspace";
  return "Rebuild workspace";
}

export default function App() {
  const pathname = window.location.pathname;
  const workspace = routeLabel(pathname);

  return (
    <main className="min-h-screen bg-[#101012] text-stone-50">
      <header className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em] text-mint">
                Frontend only
              </span>
              <span className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em] text-red-100">
                Backend removed
              </span>
              <span className="rounded-md border border-berry/30 bg-berry/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em] text-berry">
                Rebuild mode
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-50 sm:text-4xl">TradePilot AI Scanner</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
              The backend has been cancelled. This is now a clean frontend prototype shell for rebuilding the product experience without API,
              database, automation worker, broker, or server dependencies.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Current route</p>
            <p className="mt-1 text-sm font-semibold text-stone-100">{workspace}</p>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:px-8">
        <div className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Clean rebuild base</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">Frontend command center</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
                Use this screen as the starting point for the new app version. The interface keeps the dark fintech direction, but every backend-powered
                feature has been replaced with static, rebuild-safe UI state.
              </p>
            </div>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-mint/30 bg-mint px-4 text-sm font-bold text-ink shadow-glow">
              <Sparkles className="h-4 w-4" />
              Start rebuild
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {prototypeMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{metric.label}</p>
                      <p className="mt-3 text-2xl font-bold text-stone-50">{metric.value}</p>
                      <p className="mt-1 text-sm text-stone-500">{metric.helper}</p>
                    </div>
                    <span className="grid h-9 w-9 place-items-center rounded-md border border-mint/25 bg-mint/10 text-mint">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-caution/25 bg-caution/10 p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-caution" />
            <h3 className="text-lg font-semibold text-amber-100">Safety lock</h3>
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-amber-100/70">Real trading</span>
              <span className="font-bold text-amber-100">Disabled</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-100/70">Broker execution</span>
              <span className="font-bold text-amber-100">Removed</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-100/70">Database</span>
              <span className="font-bold text-amber-100">Removed</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-100/70">Workers</span>
              <span className="font-bold text-amber-100">Stopped</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-stone-50">Rebuild modules</h3>
            <Activity className="h-5 w-5 text-mint" />
          </div>
          <div className="mt-4 grid gap-2">
            {rebuildModules.map((module, index) => (
              <div key={module} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-sm">
                <span className="font-medium text-stone-200">{module}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Phase {index + 1}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-stone-50">Static market preview</h3>
              <p className="mt-1 text-sm text-stone-500">Mock data only. No API calls are made.</p>
            </div>
            <div className="flex gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-stone-300">
                <CandlestickChart className="h-4 w-4" />
              </span>
              <span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-stone-300">
                <Bell className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto scrollbar-thin">
            <table className="min-w-[620px] w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-stone-500">
                <tr>
                  <th className="py-3 pr-4">Asset</th>
                  <th className="py-3 pr-4">Score</th>
                  <th className="py-3 pr-4">Decision</th>
                  <th className="py-3 pr-4">Risk</th>
                  <th className="py-3 pr-4">Move</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {mockOpportunities.map((asset) => (
                  <tr key={asset.symbol}>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md border border-mint/25 bg-mint/10 text-xs font-bold text-mint">
                          {asset.symbol}
                        </span>
                        <div>
                          <p className="font-semibold text-stone-100">{asset.name}</p>
                          <p className="text-xs text-stone-500">Frontend mock</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 font-semibold text-stone-100">{asset.score}</td>
                    <td className="py-4 pr-4 text-stone-300">{asset.decision}</td>
                    <td className="py-4 pr-4 text-stone-300">{asset.risk}</td>
                    <td className="py-4 pr-4 font-semibold text-mint">{asset.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-white/10 px-4 py-5 text-sm text-stone-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <span>Frontend-only rebuild shell. No server, database, broker, worker, or AI provider is connected.</span>
        <span className="inline-flex items-center gap-2 text-stone-400">
          <CircleDollarSign className="h-4 w-4 text-mint" />
          Paper-trading visuals only
        </span>
      </footer>
    </main>
  );
}
