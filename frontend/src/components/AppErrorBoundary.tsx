import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TradePilot UI failed to render.", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase text-mint">TradePilot AI Scanner</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-50">The interface needs a refresh</h1>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            The app caught a browser-side loading problem before it could open the dashboard.
          </p>
          <p className="mt-3 rounded-lg border border-line bg-white/[0.03] p-3 text-xs text-stone-500">
            {this.state.error.message || "Unknown render error"}
          </p>
          <button
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
