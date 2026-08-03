import { FormEvent, ReactNode, useEffect, useState } from "react";
import { LockKeyhole, MailCheck, ShieldCheck, Sparkles } from "lucide-react";
import { api, clearAuthToken, getStoredAuthToken, storeAuthToken } from "../lib/api";

type AuthGateProps = { children: ReactNode };

export function AuthGate({ children }: AuthGateProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [devCode, setDevCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getStoredAuthToken()) { setChecking(false); return; }
    api.session()
      .then((session) => { setDisplayName(session.displayName); setAuthenticated(true); })
      .catch(() => { clearAuthToken(); setAuthenticated(false); })
      .finally(() => setChecking(false));
  }, []);

  async function requestCode() {
    if (!email.trim()) { setError("Enter your email address."); return; }
    setSubmitting(true); setError(""); setDevCode("");
    try {
      const result = await api.requestLoginCode(email);
      setCodeSent(true); setMaskedEmail(result.email); setExpiresAt(result.expiresAt); setDevCode(result.devCode ?? "");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not send a login code.");
    } finally { setSubmitting(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const result = mfaToken ? await api.verifyMfaLogin(mfaToken, code) : await api.verifyLoginCode(email, code);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken); setCode(""); setDisplayName(result.displayName); return;
      }
      if (!result.token) throw new Error("Authentication token was not issued.");
      storeAuthToken(result.token); setDisplayName(result.displayName); setWelcome(true);
      window.setTimeout(() => { setAuthenticated(true); setWelcome(false); }, 900);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Access code denied.");
    } finally { setSubmitting(false); }
  }

  if (authenticated) return children;
  if (checking) return <main className="auth-shell"><div className="auth-orbit" /><div className="text-sm font-semibold uppercase text-mint">TradePilot Pro</div></main>;
  if (welcome) return (
    <main className="auth-shell"><div className="welcome-pulse"><Sparkles className="h-8 w-8 text-mint" /><h1>Welcome {displayName || "to TradePilot"}</h1><div className="welcome-bars" aria-hidden="true"><span /><span /><span /></div></div></main>
  );

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-mint/30 bg-mint/10 text-mint">{codeSent ? <MailCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}</div>
        <div>
          <p className="text-xs font-semibold uppercase text-mint">Secure Access</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-50">TradePilot Professional</h1>
          <p className="mt-2 text-sm leading-6 text-stone-400">{mfaToken ? "Enter the 6-digit code from your authenticator app." : codeSent ? `Enter the 6-digit code sent to ${maskedEmail}.` : "Sign in with your email. Each account has isolated portfolios, broker connections, orders and strategies."}</p>
        </div>
        {!codeSent ? (
          <div className="mt-6 space-y-4">
            <label className="space-y-2 text-sm text-stone-300"><span>Email</span><input className="h-12 w-full rounded-lg border border-line bg-ink px-4 text-stone-100" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {error ? <p className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}
            <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60" disabled={submitting} onClick={requestCode} type="button"><MailCheck className="h-4 w-4" />{submitting ? "Sending code..." : "Send secure code"}</button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="space-y-2 text-sm text-stone-300"><span>{mfaToken ? "Authenticator code" : "Verification code"}</span><input autoFocus className="h-12 w-full rounded-lg border border-line bg-ink px-4 text-center text-xl font-semibold tracking-[0.35em] text-stone-100" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
            {expiresAt ? <p className="text-xs text-stone-500">Code expires at {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p> : null}
            {devCode ? <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">Development code: <span className="font-semibold tracking-[0.2em]">{devCode}</span></p> : null}
            {error ? <p className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}
            <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60" disabled={code.length !== 6 || submitting}><ShieldCheck className="h-4 w-4" />{submitting ? "Verifying..." : "Verify and sign in"}</button>
            {!mfaToken ? <button className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold text-stone-300 hover:border-mint/50 hover:text-mint disabled:opacity-60" disabled={submitting} onClick={requestCode} type="button">Send a new code</button> : null}
            <button className="inline-flex h-10 w-full items-center justify-center text-xs text-stone-500 hover:text-stone-300" type="button" onClick={() => { setCodeSent(false); setMfaToken(""); setCode(""); }}>Use another email</button>
          </form>
        )}
      </section>
    </main>
  );
}
