import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { LockKeyhole, MailCheck, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { api, clearAuthToken, getStoredAuthToken, storeAuthToken } from "../lib/api";

type AuthGateProps = {
  children: ReactNode;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

export function AuthGate({ children }: AuthGateProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [devCode, setDevCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState("Trader");
  const [error, setError] = useState("");
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current || codeSent) return;

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          void submitGoogleCredential(response.credential);
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        text: mode === "register" ? "signup_with" : "signin_with",
        shape: "rectangular",
        width: 320
      });
    };

    if (window.google) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existingScript ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    if (!existingScript) document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleClientId, mode, codeSent]);

  async function requestCode() {
    setSubmitting(true);
    setError("");
    setDevCode("");

    try {
      const result = mode === "register" ? await api.register({ name, email }) : await api.requestLoginCode(email);
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

  async function submitGoogleCredential(credential?: string) {
    if (!credential) {
      setError("Google sign-in did not return a credential.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const result = await api.googleLogin(credential);
      storeAuthToken(result.token);
      setWelcomeName(result.displayName || "Trader");
      setWelcome(true);
      window.setTimeout(() => {
        setAuthenticated(true);
        setWelcome(false);
      }, 1900);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await api.verifyLoginCode(code, email);
      storeAuthToken(result.token);
      setWelcomeName(result.displayName || name || "Trader");
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
          <h1>Welcome {welcomeName}</h1>
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
          <p className="text-xs font-semibold uppercase text-mint">Secure Access</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-50">{mode === "register" ? "Create your account" : "TradePilot AI Scanner"}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-400">
            {codeSent
              ? `Enter the 6-digit code sent to ${maskedEmail}.`
              : mode === "register"
                ? "Register once, then unlock your own paper-trading workspace with a one-time access code."
                : "Enter your email to request a one-time access code for your own TradePilot workspace."}
          </p>
        </div>

        {!codeSent ? (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-ink p-1">
              {[
                ["login", "Login"],
                ["register", "Register"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`h-10 rounded-md text-sm font-semibold transition ${mode === value ? "bg-mint text-ink" : "text-stone-400 hover:bg-white/6 hover:text-stone-100"}`}
                  onClick={() => {
                    setMode(value as "login" | "register");
                    setError("");
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "register" ? (
              <label className="space-y-2 text-sm text-stone-300">
                <span>Full name</span>
                <input
                  autoComplete="name"
                  className="h-12 w-full rounded-lg border border-line bg-ink px-4 text-stone-100 outline-none transition focus:border-mint/60"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            ) : null}
            <label className="space-y-2 text-sm text-stone-300">
              <span>Email address</span>
              <input
                autoComplete="email"
                className="h-12 w-full rounded-lg border border-line bg-ink px-4 text-stone-100 outline-none transition focus:border-mint/60"
                inputMode="email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {error ? <p className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{error}</p> : null}
            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-60"
              disabled={submitting || !email.includes("@") || (mode === "register" && name.trim().length < 2)}
              onClick={requestCode}
              type="button"
            >
              {mode === "register" ? <UserPlus className="h-4 w-4" /> : <MailCheck className="h-4 w-4" />}
              {submitting ? "Sending code..." : mode === "register" ? "Register and send code" : "Send access code"}
            </button>
            {googleClientId ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-stone-600">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="flex min-h-11 justify-center" ref={googleButtonRef} />
              </div>
            ) : null}
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
