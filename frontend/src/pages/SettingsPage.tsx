import { Lock, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import type { UserSettings } from "../lib/types";

const roadmap = [
  "V1: Market scanner + AI research + paper trading",
  "V2: Real market data provider",
  "V3: Alerts and notifications",
  "V4: Backtesting engine",
  "V5: Multi-agent research system",
  "V6: Portfolio risk engine",
  "V7: Broker connection with manual approval only",
  "V8: Advanced automation with strict user-defined rules"
];

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"stock" | "crypto" | "global">("stock");

  useEffect(() => {
    api.settings().then(setSettings);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const saved = await api.updateSettings(settings);
    setSettings(saved);
    setNotice("Settings saved.");
  }

  if (!settings) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-amber-100">Real trading is disabled in this MVP.</section>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Risk profile</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">Settings</h2>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      <div className="inline-flex rounded-lg border border-line bg-white/[0.04] p-1">
        {[
          ["stock", "Stock Risk"],
          ["crypto", "Crypto Risk"],
          ["global", "Global Safety"]
        ].map(([value, label]) => (
          <button
            key={value}
            className={`h-10 rounded-md px-4 text-sm font-semibold ${tab === value ? "bg-mint text-ink" : "text-stone-400 hover:bg-white/6 hover:text-stone-100"}`}
            onClick={() => setTab(value as "stock" | "crypto" | "global")}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        {tab !== "global" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                [`${tab === "crypto" ? "Crypto" : "Stock"} paper capital`, "demoCapital"],
                [`${tab === "crypto" ? "Crypto" : "Stock"} risk per trade %`, "riskPerTradePercent"],
                [`Max open ${tab === "crypto" ? "crypto" : "stock"} trades`, "maxOpenTrades"],
                [`Max ${tab === "crypto" ? "crypto" : "stock"} daily loss %`, "maxDailyLossPercent"]
              ].map(([label, key]) => (
                <label key={key} className="space-y-2 text-sm text-stone-300">
                  <span>{label}</span>
                  <input
                    type="number"
                    className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                    value={settings[key as keyof UserSettings] as number}
                    onChange={(event) => setSettings((current) => current && { ...current, [key]: Number(event.target.value) })}
                  />
                </label>
              ))}
              <label className="flex items-center gap-3 rounded-lg border border-mint/25 bg-mint/10 px-3 py-2 text-sm text-mint">
                <input
                  type="checkbox"
                  checked={settings.autoPaperTrading}
                  onChange={(event) => setSettings((current) => current && { ...current, autoPaperTrading: event.target.checked })}
                />
                Automatic paper trading
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-stone-300">
                <input type="checkbox" checked readOnly />
                {tab === "crypto" ? "Block 24h move above +25%" : "Exclude penny stocks"}
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-stone-300">
                <input type="checkbox" checked readOnly />
                {tab === "crypto" ? "Block extreme volatility" : "Exclude low liquidity stocks"}
              </label>
              {tab === "crypto" ? (
                <>
                  <label className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-red-100"><input type="checkbox" checked readOnly />No leverage</label>
                  <label className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-red-100"><input type="checkbox" checked readOnly />No futures or margin</label>
                </>
              ) : null}
            </div>
            <button className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90">
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-red-100"><input type="checkbox" disabled />Real trading disabled</label>
            <label className="flex items-center gap-3 rounded-lg border border-mint/25 bg-mint/10 px-3 py-2 text-sm text-mint"><input type="checkbox" checked readOnly />Paper trading only</label>
            <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-stone-300"><input type="checkbox" checked readOnly />Manual approval required</label>
            <label className="space-y-2 text-sm text-stone-300">
              <span>Display currency</span>
              <select
                className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                value={settings.displayCurrency ?? "USD"}
                onChange={(event) => setSettings((current) => current && { ...current, displayCurrency: event.target.value })}
              >
                <option value="USD">USD - Alpaca paper default</option>
              </select>
            </label>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90">
              <Save className="h-4 w-4" />
              Save Safety Settings
            </button>
          </div>
        )}
      </form>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex items-center gap-2 text-mint">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Safety rules</h3>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
            <li>No all-in trades.</li>
            <li>No leverage.</li>
            <li>No real-money broker execution.</li>
            <li>No automatic real order placement.</li>
            <li>No guaranteed profit language.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex items-center gap-2 text-caution">
            <Lock className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Roadmap</h3>
          </div>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
            {roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
