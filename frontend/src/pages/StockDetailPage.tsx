import { Bell, CheckCircle2, FileText, RefreshCcw, Star, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DocumentedReportCard } from "../components/DocumentedReportCard";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ResearchReportCard } from "../components/ResearchReportCard";
import { StockCard } from "../components/StockCard";
import { TradePlanCard } from "../components/TradePlanCard";
import { DecisionBadge, RiskBadge, ScoreBadge } from "../components/Badges";
import { ProfessionalPanels } from "../components/ProfessionalPanels";
import { TradeChart } from "../components/charts/TradeChart";
import { api } from "../lib/api";
import { useMarketMode } from "../lib/marketMode";
import type { ChartPoint, DocumentedInvestmentReport, ResearchReport, Stock, TradePlan } from "../lib/types";

export function StockDetailPage() {
  const { ticker = "", symbol: cryptoSymbol = "" } = useParams();
  const symbol = (ticker || cryptoSymbol).toUpperCase();
  const { marketMode, assetLabel, marketLabel } = useMarketMode();
  const [stock, setStock] = useState<Stock | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [documentedReport, setDocumentedReport] = useState<DocumentedInvestmentReport | null>(null);
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const [stockData, chartData, reportData, planData] = await Promise.all([
      api.stock(symbol, marketMode),
      api.chart(symbol, marketMode),
      api.research(symbol, marketMode),
      api.tradePlansForTicker(symbol, marketMode)
    ]);
    setStock(stockData);
    setChart(chartData);
    setReport(reportData);
    setPlans(planData);
    setDocumentedReport(null);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [symbol, marketMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      Promise.all([api.stock(symbol, marketMode), api.chart(symbol, marketMode)])
        .then(([stockData, chartData]) => {
          setStock(stockData);
          setChart(chartData);
        })
        .catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [symbol, marketMode]);

  async function generateResearch() {
    const next = await api.generateResearch(symbol, marketMode);
    setReport(next);
    setNotice("Research report refreshed.");
  }

  async function generateDocumentedReport() {
    setReporting(true);
    try {
      const next = await api.documentedReport(symbol, marketMode);
      setDocumentedReport(next);
      setNotice("Documented research report generated.");
    } finally {
      setReporting(false);
    }
  }

  async function addWatchlist() {
    await api.addWatchlist(symbol, {
      market: marketMode,
      score: report?.aiScore ?? stock?.signal?.score ?? 50,
      riskLevel: report?.riskLevel ?? stock?.signal?.riskLevel ?? "Medium",
      decision: report?.decision ?? stock?.signal?.decision ?? "Research More"
    });
    setNotice(`${symbol} added to watchlist.`);
  }

  async function createPlan() {
    const plan = await api.createTradePlan(symbol, marketMode);
    setPlans((current) => [plan, ...current]);
    setNotice(`Paper trade plan created with status: ${plan.status}.`);
  }

  async function approve(plan: TradePlan) {
    await api.approvePaperTrade(plan.id);
    setNotice(`${plan.ticker} paper trade opened. Real-money trading remains disabled.`);
    await load();
  }

  async function setAlert() {
    await api.addAlert({
      ticker: symbol,
      market: marketMode,
      alertType: "Price",
      targetPrice: stock ? Number((stock.price * 0.96).toFixed(2)) : undefined,
      message: `Review ${symbol} near the planned risk zone.`,
      active: true
    });
    setNotice(`${symbol} alert saved.`);
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!stock) return <EmptyState icon={XCircle} title="Asset not found" description={`The mock ${assetLabel} provider does not include that ticker.`} />;

  return (
    <div className="space-y-6">
      {notice ? <div className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">{notice}</div> : null}

      <section className="rounded-lg border border-caution/25 bg-caution/10 p-4 text-sm font-semibold text-amber-100">
        {marketMode === "crypto"
          ? "Crypto paper trading only. Real crypto trading, leverage, futures, and withdrawals are disabled."
          : "Stock paper trading only. Real trading is disabled."}
      </section>

      <StockCard stock={stock} />

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6"
          onClick={addWatchlist}
        >
          <Star className="h-4 w-4" />
          Add to Watchlist
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90"
          onClick={createPlan}
        >
          <CheckCircle2 className="h-4 w-4" />
          Create {marketLabel} Paper Trade Plan
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6"
          onClick={generateResearch}
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh Research
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint hover:bg-mint/15 disabled:opacity-60"
          onClick={generateDocumentedReport}
          disabled={reporting}
        >
          <FileText className="h-4 w-4" />
          {reporting ? "Generating..." : "Documented Report"}
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-caution/30 bg-caution/10 px-4 text-sm font-semibold text-amber-100"
          onClick={setAlert}
        >
          <Bell className="h-4 w-4" />
          Set Alert
        </button>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-red-200">
          <XCircle className="h-4 w-4" />
          Reject
        </button>
      </div>

      {stock.signal ? (
        <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
          <div className="flex flex-wrap items-center gap-3">
            <ScoreBadge score={stock.signal.score} />
            <RiskBadge risk={stock.signal.riskLevel} />
            <DecisionBadge decision={stock.signal.decision} />
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-300">{stock.signal.explanation}</p>
          <div className="mt-5">
            <ProfessionalPanels
              scoreBreakdownJson={stock.signal.scoreBreakdownJson}
              checklistJson={stock.signal.checklistJson}
              noTradeReasonsJson={stock.signal.noTradeReasonsJson}
              strategyProofJson={stock.signal.strategyProofJson}
              evidenceJson={stock.signal.evidenceJson}
              researchQuality={stock.signal.researchQuality}
              strategyName={stock.signal.strategyName}
              strategyStatus={stock.signal.strategyStatus}
            />
          </div>
        </section>
      ) : null}

      <TradeChart stock={stock} marketMode={marketMode} />

      {report ? <ResearchReportCard report={report} /> : null}

      {documentedReport ? <DocumentedReportCard report={documentedReport} /> : null}

      <div className="space-y-4">
        {plans.map((plan) => (
          <TradePlanCard key={plan.id} plan={plan} onApprove={approve} />
        ))}
        {!plans.length ? (
          <EmptyState icon={CheckCircle2} title="No trade plan yet" description="Create a paper plan to calculate position size, stop loss, and max risk." />
        ) : null}
      </div>
    </div>
  );
}
