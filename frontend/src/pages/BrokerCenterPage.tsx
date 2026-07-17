import { Building2, RefreshCcw, Send, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { SafetyBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import { dateShort, usd } from "../lib/format";
import type { BrokerOrder, BrokerStatus, TradePlan } from "../lib/types";

export function BrokerCenterPage() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    const [statusData, orderData, planData] = await Promise.all([api.brokerStatus(), api.brokerOrders(), api.tradePlans()]);
    setStatus(statusData);
    setOrders(orderData);
    setPlans(planData);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function sync() {
    const result = await api.brokerSync();
    setNotice(result.error ? `Broker sync warning: ${result.error}` : "Broker account synced.");
    await load();
  }

  async function submit(plan: TradePlan) {
    const order = await api.submitBrokerOrderFromTradePlan(plan.id);
    setNotice(
      order.status === "Blocked"
        ? `${plan.ticker} broker order blocked: ${order.error}`
        : `${plan.ticker} submitted to Alpaca ${order.environment} trading.`
    );
    await load();
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!status) return <EmptyState icon={Building2} title="Broker status unavailable" description="The backend did not return broker configuration." />;

  const connection = status.connection;
  const eligiblePlans = plans.filter((plan) => plan.quantity > 0 && plan.status !== "Watchlist Only").slice(0, 8);
  const paperConnected = status.environment === "paper" && status.configured && connection?.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Real broker connector</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">Broker Center</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label={paperConnected ? "ALPACA PAPER CONNECTED" : status.environment === "paper" ? "ALPACA PAPER" : "ALPACA LIVE CONFIG"} tone={status.environment === "paper" ? "green" : "red"} />
          <SafetyBadge label="REAL TRADING DISABLED" tone="red" />
          <SafetyBadge label="MANUAL APPROVAL" tone="amber" />
        </div>
      </div>

      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      <section className="rounded-lg border border-danger/25 bg-danger/10 p-4 text-red-100">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldOff className="h-5 w-5" />
          Alpaca paper trading is functional. Real-money execution remains blocked.
        </div>
        <p className="mt-2 text-sm leading-6 text-red-100/80">
          Connected paper accounts can receive manually approved paper orders. Any live or real-money order attempt is recorded and blocked by the backend risk engine.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Provider" value={status.provider.toUpperCase()} icon={Building2} tone="purple" />
        <StatCard label="Environment" value={status.environment.toUpperCase()} icon={Building2} tone={status.environment === "paper" ? "green" : "red"} />
        <StatCard label="Auth mode" value={status.authMode === "oauth_client_credentials" ? "AUTHX" : "API KEY"} icon={RefreshCcw} tone="amber" />
        <StatCard label="Buying power" value={connection?.buyingPower ? usd.format(connection.buyingPower) : "Not synced"} icon={Building2} tone="neutral" />
      </div>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-50">Alpaca account</h3>
            <p className="mt-1 text-sm text-stone-400">
              Base URL: <span className="text-stone-200">{status.baseUrl}</span>
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Auth URL: <span className="text-stone-200">{status.authBaseUrl}</span>
            </p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90" onClick={sync}>
            <RefreshCcw className="h-4 w-4" />
            Sync Account
          </button>
        </div>
        <dl className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">Status</dt>
            <dd className="mt-2 font-semibold text-stone-100">{connection?.status ?? "Not connected"}</dd>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">Account</dt>
            <dd className="mt-2 font-semibold text-stone-100">{connection?.accountNumber ?? "Hidden / not synced"}</dd>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">Cash</dt>
            <dd className="mt-2 font-semibold text-stone-100">{connection?.cash ? usd.format(connection.cash) : "Not synced"}</dd>
          </div>
          <div className="rounded-lg border border-line bg-white/[0.03] p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">Last sync</dt>
            <dd className="mt-2 font-semibold text-stone-100">{connection?.lastSyncAt ? dateShort(connection.lastSyncAt) : "Never"}</dd>
          </div>
        </dl>
        {!status.configured ? (
          <p className="mt-4 rounded-lg border border-caution/25 bg-caution/10 p-3 text-sm leading-6 text-amber-100">
            {status.authMode === "oauth_client_credentials"
              ? "Add ALPACA_OAUTH_CLIENT_ID and ALPACA_OAUTH_CLIENT_SECRET to backend/.env, then restart the backend."
              : "Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to backend/.env with ALPACA_TRADING_ENV=paper, then restart the backend."}
          </p>
        ) : null}
        {connection?.lastError ? <p className="mt-4 rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-red-100">{connection.lastError}</p> : null}
      </section>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <h3 className="text-lg font-semibold text-stone-50">Submit eligible trade plans to broker paper</h3>
        <div className="mt-4 overflow-x-auto scrollbar-thin">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-stone-500">
              <tr>
                <th className="py-3 pr-4">Ticker</th>
                <th className="py-3 pr-4">Entry</th>
                <th className="py-3 pr-4">Qty</th>
                <th className="py-3 pr-4">Stop</th>
                <th className="py-3 pr-4">Take profit</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {eligiblePlans.map((plan) => (
                <tr key={plan.id}>
                  <td className="py-4 pr-4 font-semibold text-stone-100">{plan.ticker}</td>
                  <td className="py-4 pr-4 text-stone-300">{usd.format(plan.entryPrice)}</td>
                  <td className="py-4 pr-4 text-stone-300">{plan.quantity}</td>
                  <td className="py-4 pr-4 text-danger">{usd.format(plan.stopLoss)}</td>
                  <td className="py-4 pr-4 text-mint">{usd.format(plan.takeProfit)}</td>
                  <td className="py-4 pr-4 text-stone-400">{plan.status}</td>
                  <td className="py-4 pr-4">
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => submit(plan)}
                      disabled={!status.configured || status.environment !== "paper"}
                    >
                      <Send className="h-4 w-4" />
                      Submit Paper
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!eligiblePlans.length ? <p className="mt-4 text-sm text-stone-400">No eligible trade plans yet.</p> : null}
      </section>

      <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <h3 className="text-lg font-semibold text-stone-50">Broker order audit trail</h3>
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-lg border border-line bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-stone-100">
                  {order.ticker} · {order.side.toUpperCase()} · {order.status}
                </p>
                <span className="text-xs text-stone-500">{dateShort(order.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-stone-400">
                {order.provider} {order.environment} · qty {order.quantity} · stop {order.stopPrice ? usd.format(order.stopPrice) : "none"} · target{" "}
                {order.takeProfitPrice ? usd.format(order.takeProfitPrice) : "none"}
              </p>
              {order.error ? <p className="mt-2 text-sm text-red-200">{order.error}</p> : null}
            </article>
          ))}
          {!orders.length ? <p className="text-sm text-stone-400">No broker orders recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
