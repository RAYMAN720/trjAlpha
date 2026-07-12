import { CheckCircle2, Siren, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";
import { useMarketMode } from "../lib/marketMode";
import type { Alert } from "../lib/types";

export function AlertsCenterPage() {
  const { marketMode, marketLabel } = useMarketMode();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setAlerts(await api.alerts(marketMode));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [marketMode]);

  async function read(alert: Alert) {
    await api.readAlert(alert.id);
    await load();
  }

  async function remove(alert: Alert) {
    await api.removeAlert(alert.id);
    await load();
  }

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Automation signals</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">{marketLabel} Alerts</h2>
      </div>

      {alerts.length ? (
        <div className="grid gap-3">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className={`rounded-lg border p-4 shadow-glow ${
                alert.severity === "High"
                  ? "border-danger/30 bg-danger/10"
                  : alert.severity === "Warning"
                    ? "border-caution/30 bg-caution/10"
                    : "border-line bg-panel/88"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-50">{alert.ticker}</span>
                    <span className="rounded-full border border-line px-2.5 py-1 text-xs text-stone-300">{alert.alertType}</span>
                    <span className="rounded-full border border-line px-2.5 py-1 text-xs text-stone-300">{alert.severity}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-300">{alert.message}</p>
                  <p className="mt-2 text-xs text-stone-500">{dateShort(alert.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  {alert.active ? (
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint"
                      onClick={() => read(alert)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Read
                    </button>
                  ) : null}
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-semibold text-red-200"
                    onClick={() => remove(alert)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Siren} title="No alerts yet" description="Automation jobs will create alerts for opportunities, trade events, risk warnings, and daily reports." />
      )}
    </div>
  );
}
