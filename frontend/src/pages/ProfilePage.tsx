import { FormEvent, useEffect, useState } from "react";
import { Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.profile().then(setProfile).catch((profileError) => {
      setError(profileError instanceof Error ? profileError.message : "Could not load profile.");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setNotice("");
    setError("");
    try {
      const saved = await api.updateProfile(profile);
      setProfile(saved);
      setNotice("Profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    }
  }

  if (!profile && !error) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-mint/25 bg-mint/10 p-4 text-sm font-semibold text-mint">
        Paper trading only. Real-money trading remains disabled for every account.
      </section>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Account</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">Profile</h2>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</div> : null}

      {profile ? (
        <form className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]" onSubmit={submit}>
          <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-mint/25 bg-mint/10 text-mint">
                {profile.avatarUrl ? <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} /> : <UserRound className="h-8 w-8" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-50">{profile.name}</h3>
                <p className="text-sm text-stone-400">{profile.authProvider === "google" ? "Google account" : "Email account"}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm text-stone-300">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] p-3">
                <Mail className="h-4 w-4 text-mint" />
                <span className="truncate">{profile.email}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 p-3 text-red-100">
                <ShieldCheck className="h-4 w-4" />
                <span>Real trading disabled</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-stone-300">
                <span>Display name</span>
                <input
                  className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                  value={profile.name}
                  onChange={(event) => setProfile((current) => current && { ...current, name: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm text-stone-300">
                <span>Email address</span>
                <input className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-500" readOnly value={profile.email} />
              </label>
              <label className="space-y-2 text-sm text-stone-300">
                <span>Display currency</span>
                <select
                  className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                  value={profile.displayCurrency ?? "USD"}
                  onChange={(event) => setProfile((current) => current && { ...current, displayCurrency: event.target.value })}
                >
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-stone-300">
                <span>Paper capital</span>
                <input
                  className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                  min={100}
                  type="number"
                  value={profile.demoCapital}
                  onChange={(event) => setProfile((current) => current && { ...current, demoCapital: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-2 text-sm text-stone-300">
                <span>Risk per trade %</span>
                <input
                  className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                  max={5}
                  min={0.1}
                  step={0.1}
                  type="number"
                  value={profile.riskPerTradePercent}
                  onChange={(event) => setProfile((current) => current && { ...current, riskPerTradePercent: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-2 text-sm text-stone-300">
                <span>Max open trades</span>
                <input
                  className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                  max={20}
                  min={1}
                  type="number"
                  value={profile.maxOpenTrades}
                  onChange={(event) => setProfile((current) => current && { ...current, maxOpenTrades: Number(event.target.value) })}
                />
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-mint/25 bg-mint/10 px-3 py-3 text-sm text-mint">
                <input
                  checked={profile.autoPaperTrading}
                  type="checkbox"
                  onChange={(event) => setProfile((current) => current && { ...current, autoPaperTrading: event.target.checked })}
                />
                Automatic paper trading
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.03] px-3 py-3 text-sm text-stone-300">
                <input
                  checked={profile.beginnerMode}
                  type="checkbox"
                  onChange={(event) => setProfile((current) => current && { ...current, beginnerMode: event.target.checked })}
                />
                Beginner guardrails
              </label>
            </div>
            <button className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90">
              <Save className="h-4 w-4" />
              Save Profile
            </button>
          </section>
        </form>
      ) : null}
    </div>
  );
}
