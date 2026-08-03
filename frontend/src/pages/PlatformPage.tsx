import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, Building2, Database, Layers3, Play, RefreshCw, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { api, professionalRealtimeUrl } from "../lib/api";

type Row = Record<string, unknown>;

function value(row: Row, key: string, fallback = "—") {
  const current = row[key];
  return current === undefined || current === null || current === "" ? fallback : String(current);
}

function versionsFor(row: Row) {
  return Array.isArray(row.versions) ? row.versions as Row[] : [];
}

const inputClass = "h-10 w-full rounded-lg border border-line bg-black/20 px-3 text-sm text-stone-100 outline-none focus:border-mint/50";
const buttonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint hover:bg-mint/15 disabled:cursor-not-allowed disabled:opacity-40";

export function PlatformPage() {
  const [capabilities, setCapabilities] = useState<Row>({});
  const [portfolios, setPortfolios] = useState<Row[]>([]);
  const [brokers, setBrokers] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [strategies, setStrategies] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioType, setPortfolioType] = useState("INVESTMENT");
  const [portfolioCurrency, setPortfolioCurrency] = useState("USD");

  const [brokerPortfolioId, setBrokerPortfolioId] = useState("");
  const [brokerEnvironment, setBrokerEnvironment] = useState<"paper" | "live">("paper");
  const [brokerLabel, setBrokerLabel] = useState("");
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");

  const [orderPortfolioId, setOrderPortfolioId] = useState("");
  const [orderBrokerId, setOrderBrokerId] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT">("MARKET");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const [strategyName, setStrategyName] = useState("");
  const [strategyDescription, setStrategyDescription] = useState("");
  const [jobMode, setJobMode] = useState<"BACKTEST" | "PAPER">("BACKTEST");
  const [jobPortfolioId, setJobPortfolioId] = useState("");
  const [jobStrategyVersionId, setJobStrategyVersionId] = useState("");
  const [jobBrokerId, setJobBrokerId] = useState("");
  const [jobSymbols, setJobSymbols] = useState("AAPL,MSFT");
  const [jobStartDate, setJobStartDate] = useState("2025-01-01");
  const [jobEndDate, setJobEndDate] = useState("2025-12-31");

  async function load() {
    setLoading(true); setError("");
    try {
      const [caps, portfolioRows, brokerRows, orderRows, strategyRows, jobRows] = await Promise.all([
        api.professionalCapabilities(), api.professionalPortfolios(), api.professionalBrokers(), api.professionalOrders(), api.professionalStrategies(), api.professionalLeanJobs()
      ]);
      setCapabilities(caps); setPortfolios(portfolioRows); setBrokers(brokerRows); setOrders(orderRows); setStrategies(strategyRows); setJobs(jobRows);
      const firstPortfolio = value(portfolioRows[0] ?? {}, "id", "");
      if (!brokerPortfolioId) setBrokerPortfolioId(firstPortfolio);
      if (!orderPortfolioId) setOrderPortfolioId(firstPortfolio);
      if (!jobPortfolioId) setJobPortfolioId(firstPortfolio);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the professional platform core.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let cancelled = false;
    let refreshTimer: number | undefined;
    void api.professionalRealtimeTicket().then(({ ticket }) => {
      if (cancelled) return;
      socket = new WebSocket(professionalRealtimeUrl(ticket));
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as { type?: string };
          if (!event.type || ["CONNECTED", "HEARTBEAT"].includes(event.type)) return;
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => { void load(); }, 250);
        } catch { /* Ignore non-JSON transport noise. */ }
      };
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      socket?.close();
    };
  }, []);

  const activeOrders = useMemo(() => orders.filter((order) => !["FILLED", "CANCELLED", "REJECTED", "ERROR", "EXPIRED"].includes(value(order, "status"))).length, [orders]);
  const compatibleBrokers = useMemo(() => brokers.filter((broker) => !orderPortfolioId || value(broker, "portfolioId", "") === orderPortfolioId), [brokers, orderPortfolioId]);
  const strategyVersions = useMemo(() => strategies.flatMap((strategy) => versionsFor(strategy).map((version) => ({ strategy, version }))), [strategies]);

  async function runAction(name: string, action: () => Promise<unknown>, message: string) {
    setBusy(name); setError(""); setSuccess("");
    try { await action(); setSuccess(message); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Operation failed."); }
    finally { setBusy(""); }
  }

  async function createPortfolio(event: FormEvent) {
    event.preventDefault();
    await runAction("portfolio", () => api.professionalCreatePortfolio({ name: portfolioName, type: portfolioType, baseCurrency: portfolioCurrency }), "Portfolio created.");
    setPortfolioName("");
  }

  async function connectBroker(event: FormEvent) {
    event.preventDefault();
    await runAction("broker", () => api.professionalConnectAlpaca({ portfolioId: brokerPortfolioId, environment: brokerEnvironment, keyId: alpacaKey, secretKey: alpacaSecret, accountLabel: brokerLabel || undefined }), "Broker account connected and reconciled into the portfolio.");
    setAlpacaKey(""); setAlpacaSecret("");
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    const body: Row = { portfolioId: orderPortfolioId, brokerAccountId: orderBrokerId, symbol: symbol.toUpperCase(), side, type: orderType, quantity };
    if (limitPrice) body.limitPrice = limitPrice;
    if (stopPrice) body.stopPrice = stopPrice;
    await runAction("order", () => api.professionalCreateOrder(body), "Order passed through the professional OMS. Check the order state below.");
  }

  async function createStrategy(event: FormEvent) {
    event.preventDefault();
    await runAction("strategy", () => api.professionalCreateStrategy({ name: strategyName, description: strategyDescription || undefined }), "Versioned strategy created.");
    setStrategyName(""); setStrategyDescription("");
  }

  async function queueLeanJob(event: FormEvent) {
    event.preventDefault();
    const symbols = jobSymbols.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    const request: Row = { symbols };
    if (jobMode === "BACKTEST") { request.startDate = jobStartDate; request.endDate = jobEndDate; }
    if (jobMode === "PAPER" && jobBrokerId) request.brokerAccountId = jobBrokerId;
    await runAction("lean", () => api.professionalQueueLeanJob({ mode: jobMode, portfolioId: jobPortfolioId || undefined, strategyVersionId: jobStrategyVersionId || undefined, request }), "LEAN job queued for an independent worker.");
  }

  const cards = [
    { label: "Portfolios", count: portfolios.length, icon: WalletCards, note: "Isolated user-owned accounts" },
    { label: "Broker accounts", count: brokers.length, icon: Building2, note: "Encrypted credentials" },
    { label: "Active orders", count: activeOrders, icon: Activity, note: "Risk-gated + idempotent" },
    { label: "Strategies", count: strategies.length, icon: Layers3, note: "Immutable versions" },
    { label: "LEAN jobs", count: jobs.length, icon: Database, note: "Database-backed worker queue" }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-mint/20 bg-gradient-to-br from-mint/10 via-white/[0.03] to-transparent p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint">TradePilot v4</p><h2 className="mt-2 text-2xl font-semibold text-stone-50">Professional Multi-User Core</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">Portfolio isolation, encrypted broker connections, deterministic pre-trade risk, an idempotent order-management system, decimal ledger accounting, versioned strategies and scalable LEAN jobs.</p></div>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:border-mint/40" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5 text-mint"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Tenant isolated</span><span className="rounded-full border border-line px-3 py-1.5 text-stone-300">Decimal accounting</span><span className="rounded-full border border-line px-3 py-1.5 text-stone-300">Non-custodial</span><span className="rounded-full border border-line px-3 py-1.5 text-stone-300">Worker pool ready</span></div>
      </section>

      {error ? <div className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-xl border border-mint/25 bg-mint/10 p-4 text-sm text-mint">{success}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => <article key={card.label} className="rounded-xl border border-line bg-white/[0.03] p-4"><card.icon className="h-5 w-5 text-mint" /><div className="mt-4 text-2xl font-semibold text-stone-50">{loading ? "…" : card.count}</div><div className="mt-1 text-sm font-semibold text-stone-200">{card.label}</div><p className="mt-1 text-xs text-stone-500">{card.note}</p></article>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={createPortfolio} className="rounded-xl border border-line bg-white/[0.025] p-5">
          <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Create portfolio</h3></div>
          <div className="mt-4 space-y-3"><input className={inputClass} placeholder="Portfolio name" value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} required /><select className={inputClass} value={portfolioType} onChange={(e) => setPortfolioType(e.target.value)}><option value="INVESTMENT">Investment</option><option value="TRADING">Trading</option><option value="PAPER">Paper</option></select><input className={inputClass} value={portfolioCurrency} maxLength={3} onChange={(e) => setPortfolioCurrency(e.target.value.toUpperCase())} /><button className={buttonClass} disabled={busy === "portfolio"}>{busy === "portfolio" ? "Creating…" : "Create portfolio"}</button></div>
        </form>

        <form onSubmit={connectBroker} className="rounded-xl border border-line bg-white/[0.025] p-5 xl:col-span-2">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Connect Alpaca</h3></div>
          <p className="mt-2 text-xs leading-5 text-stone-500">Credentials are encrypted server-side and never returned by the API. Start with paper. A linked live account still cannot execute until live permission is explicitly enabled with MFA and operator guardrails.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2"><select className={inputClass} value={brokerPortfolioId} onChange={(e) => setBrokerPortfolioId(e.target.value)} required>{portfolios.map((portfolio) => <option key={value(portfolio,"id")} value={value(portfolio,"id","")}>{value(portfolio,"name")}</option>)}</select><select className={inputClass} value={brokerEnvironment} onChange={(e) => setBrokerEnvironment(e.target.value as "paper" | "live")}><option value="paper">Paper</option><option value="live">Live connection (guarded)</option></select><input className={inputClass} placeholder="Account label (optional)" value={brokerLabel} onChange={(e) => setBrokerLabel(e.target.value)} /><input className={inputClass} autoComplete="off" placeholder="Alpaca API key" value={alpacaKey} onChange={(e) => setAlpacaKey(e.target.value)} required /><input className={`${inputClass} md:col-span-2`} type="password" autoComplete="new-password" placeholder="Alpaca secret key" value={alpacaSecret} onChange={(e) => setAlpacaSecret(e.target.value)} required /></div><button className={`${buttonClass} mt-3`} disabled={busy === "broker"}>{busy === "broker" ? "Connecting…" : "Connect & verify"}</button>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={submitOrder} className="rounded-xl border border-line bg-white/[0.025] p-5">
          <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Professional order ticket</h3></div>
          <p className="mt-2 text-xs text-stone-500">Every submission uses a fresh idempotency key and server-side pre-trade risk. Market pricing is resolved on the server for risk estimation.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><select className={inputClass} value={orderPortfolioId} onChange={(e) => { setOrderPortfolioId(e.target.value); setOrderBrokerId(""); }} required>{portfolios.map((portfolio) => <option key={value(portfolio,"id")} value={value(portfolio,"id","")}>{value(portfolio,"name")}</option>)}</select><select className={inputClass} value={orderBrokerId} onChange={(e) => setOrderBrokerId(e.target.value)} required><option value="">Select broker account</option>{compatibleBrokers.map((broker) => <option key={value(broker,"id")} value={value(broker,"id","")}>{value(broker,"accountLabel")} · {value(broker,"environment")}</option>)}</select><input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" required /><input className={inputClass} type="number" min="0.000001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /><select className={inputClass} value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}><option value="BUY">Buy</option><option value="SELL">Sell</option></select><select className={inputClass} value={orderType} onChange={(e) => setOrderType(e.target.value as typeof orderType)}><option value="MARKET">Market</option><option value="LIMIT">Limit</option><option value="STOP">Stop</option><option value="STOP_LIMIT">Stop-limit</option></select>{["LIMIT","STOP_LIMIT"].includes(orderType) ? <input className={inputClass} type="number" min="0.000001" step="any" placeholder="Limit price" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} required /> : null}{["STOP","STOP_LIMIT"].includes(orderType) ? <input className={inputClass} type="number" min="0.000001" step="any" placeholder="Stop price" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} required /> : null}</div><button className={`${buttonClass} mt-3`} disabled={busy === "order" || !orderBrokerId}>{busy === "order" ? "Submitting…" : "Review through risk & submit"}</button>
        </form>

        <article className="rounded-xl border border-line bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Connected brokers</h3></div><div className="mt-4 space-y-3">{brokers.length ? brokers.map((broker) => <div key={value(broker,"id")} className="rounded-lg border border-line p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-stone-100">{value(broker,"accountLabel")}</div><div className="mt-1 text-xs text-stone-500">{value(broker,"provider")} · {value(broker,"environment")} · {value(broker,"status")}</div></div><button type="button" className="rounded-md border border-line px-3 py-1.5 text-xs text-stone-300 hover:border-mint/40" onClick={() => void runAction(`reconcile-${value(broker,"id")}`, () => api.professionalReconcileBroker(value(broker,"id","")), "Broker reconciliation completed.")}>Reconcile</button></div>{value(broker,"isLive","false") === "true" ? <p className="mt-2 text-xs text-amber-200">Live account · execution permission: {value(broker,"liveTradingAllowed","false")}</p> : null}</div>) : <p className="text-sm text-stone-500">No broker account connected yet.</p>}</div></article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={createStrategy} className="rounded-xl border border-line bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Strategy registry</h3></div><p className="mt-2 text-xs text-stone-500">Strategies receive immutable versions. Backtests and deployments reference a specific version, never “latest”.</p><div className="mt-4 space-y-3"><input className={inputClass} placeholder="Strategy name" value={strategyName} onChange={(e) => setStrategyName(e.target.value)} required /><textarea className="min-h-24 w-full rounded-lg border border-line bg-black/20 p-3 text-sm text-stone-100 outline-none focus:border-mint/50" placeholder="Description" value={strategyDescription} onChange={(e) => setStrategyDescription(e.target.value)} /><button className={buttonClass} disabled={busy === "strategy"}>{busy === "strategy" ? "Creating…" : "Create v1"}</button></div></form>

        <form onSubmit={queueLeanJob} className="rounded-xl border border-line bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Play className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Queue LEAN job</h3></div><p className="mt-2 text-xs text-stone-500">Jobs are persisted first, then claimed atomically by independent LEAN workers. Add worker replicas to increase concurrency.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><select className={inputClass} value={jobMode} onChange={(e) => setJobMode(e.target.value as "BACKTEST" | "PAPER")}><option value="BACKTEST">Backtest</option><option value="PAPER">Paper strategy</option></select><select className={inputClass} value={jobPortfolioId} onChange={(e) => setJobPortfolioId(e.target.value)}><option value="">No portfolio</option>{portfolios.map((portfolio) => <option key={value(portfolio,"id")} value={value(portfolio,"id","")}>{value(portfolio,"name")}</option>)}</select><select className={`${inputClass} sm:col-span-2`} value={jobStrategyVersionId} onChange={(e) => setJobStrategyVersionId(e.target.value)}><option value="">Default TradePilot LEAN algorithm</option>{strategyVersions.map(({strategy,version}) => <option key={value(version,"id")} value={value(version,"id","")}>{value(strategy,"name")} · v{value(version,"version")}</option>)}</select><input className={`${inputClass} sm:col-span-2`} value={jobSymbols} onChange={(e) => setJobSymbols(e.target.value)} placeholder="AAPL,MSFT" />{jobMode === "BACKTEST" ? <><input className={inputClass} type="date" value={jobStartDate} onChange={(e) => setJobStartDate(e.target.value)} /><input className={inputClass} type="date" value={jobEndDate} onChange={(e) => setJobEndDate(e.target.value)} /></> : <select className={`${inputClass} sm:col-span-2`} value={jobBrokerId} onChange={(e) => setJobBrokerId(e.target.value)} required><option value="">Select paper broker</option>{brokers.filter((broker) => value(broker,"environment") === "paper").map((broker) => <option key={value(broker,"id")} value={value(broker,"id","")}>{value(broker,"accountLabel")}</option>)}</select>}</div><button className={`${buttonClass} mt-3`} disabled={busy === "lean"}>{busy === "lean" ? "Queueing…" : "Queue job"}</button></form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-line bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Recent orders</h3></div><div className="mt-4 space-y-2">{orders.slice(0,8).map((order) => <div key={value(order,"id")} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm"><span className="font-medium text-stone-100">{value(order,"side")} {value(order,"symbol")}</span><span className="text-xs text-stone-400">{value(order,"status")}</span></div>)}{!orders.length ? <p className="text-sm text-stone-500">No canonical v4 orders yet.</p> : null}</div></article>
        <article className="rounded-xl border border-line bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-mint" /><h3 className="font-semibold text-stone-100">Platform capabilities</h3></div><dl className="mt-4 grid gap-3 text-sm">{Object.entries(capabilities).slice(0,12).map(([key,current]) => <div key={key} className="flex items-start justify-between gap-4 border-b border-line/70 pb-2"><dt className="text-stone-500">{key}</dt><dd className="max-w-[60%] text-right font-medium text-stone-200">{Array.isArray(current) ? current.join(", ") : String(current)}</dd></div>)}</dl></article>
      </section>
    </div>
  );
}
