import { FormEvent, ReactNode, useEffect, useState } from "react";
import { LockKeyhole, MailCheck, ShieldCheck, Sparkles } from "lucide-react";
import { api, clearAuthToken, getStoredAuthToken, storeAuthToken } from "../lib/api";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [devCode, setDevCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getStoredAuthToken()) {
      setChecking(false);
      return;
    }

    api
      .session()
      .then(() => setAuthenticated(true))
      .catch(() => {
        clearAuthToken();
        setAuthenticated(false);
      })
      .finally(() => setChecking(false));
  }, []);

  async function requestCode() {
    setSubmitting(true);
    setError("");
    setDevCode("");

    try {
      const result = await api.requestLoginCode();
      setCodeSent(true);
      setMaskedEmail(result.email);
      setExpiresAt(result.expiresAt);
      setDevCode(result.devCode ?? "");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not send a login code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await api.verifyLoginCode(code);
      storeAuthToken(result.token);
      setWelcome(true);
      window.setTimeout(() => {
        setAuthenticated(true);
        setWelcome(false);
      }, 1900);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Access code denied.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authenticated) return children;

  if (checking) {
    return (
      <main className="auth-shell">
        <div className="auth-orbit" />
        <div className="text-sm font-semibold uppercase text-mint">TradePilot AI</div>
      </main>
    );
  }

  if (welcome) {
    return (
      <main className="auth-shell">
        <div className="welcome-pulse">
          <Sparkles className="h-8 w-8 text-mint" />
          <h1>Welcome back Rayann</h1>
          <div className="welcome-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-mint/30 bg-mint/10 text-mint">
          {codeSent ? <MailCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-mint">Private Access</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-50">TradePilot AI Scanner</h1>
          <p className="mt-2 text-sm leading-6 text-stone-400">
            {codeSent
              ? `Enter the 6-digit code sent to ${maskedEmail}.`
              : "Request a one-time access code to unlock Rayann's dashboard."}
          </p>
        </div>

        {!codeSent ? (
          <div className="mt-6 space-y-4">
            {error ? <p className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}
            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
              disabled={submitting}
              onClick={requestCode}
              type="button"
            >
              <MailCheck className="h-4 w-4" />
              {submitting ? "Sending code..." : "Send access code"}
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="space-y-2 text-sm text-stone-300">
              <span>Verification code</span>
              <input
                autoFocus
                className="h-12 w-full rounded-lg border border-line bg-ink px-4 text-center text-xl font-semibold tracking-[0.35em] text-stone-100"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            {expiresAt ? (
              <p className="text-xs text-stone-500">Code expires at {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
            ) : null}
            {devCode ? (
              <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
                Development code: <span className="font-semibold tracking-[0.2em]">{devCode}</span>
              </p>
            ) : null}
            {error ? <p className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}
            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
              disabled={code.length !== 6 || submitting}
            >
              <ShieldCheck className="h-4 w-4" />
              {submitting ? "Verifying..." : "Verify and unlock"}
            </button>
            <button
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold text-stone-300 hover:border-mint/50 hover:text-mint disabled:opacity-60"
              disabled={submitting}
              onClick={requestCode}
              type="button"
            >
              Send a new code
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
