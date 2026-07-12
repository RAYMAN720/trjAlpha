import { prisma } from "../utils/prisma.js";
import { generateResearchReport } from "./aiService.js";
import { getLearningSummary } from "./learningService.js";
import { assetTypeForMarket, marketDataProvider, normalizeMarketMode, type MarketMode } from "./marketDataProvider.js";
import { getDecision, getRiskLevel, scoreStock } from "./scannerService.js";
import { professionalDecisionLabel } from "./professionalEngine.js";

type Source = {
  title: string;
  url: string;
  reliability: "high" | "medium" | "low";
};

type ReportSection = {
  title: string;
  findings: string[];
};

export type DocumentedInvestmentReport = {
  ticker: string;
  companyName: string;
  assetClass: "stocks" | "crypto";
  generatedAt: string;
  disclosure: string;
  executiveSummary: string;
  guidance: {
    stance: "Paper-trade candidate" | "Watchlist only" | "Avoid for now";
    timeHorizon: string;
    confidence: number;
    reasoning: string[];
    conditionsBeforeAction: string[];
    invalidationConditions: string[];
    riskControls: string[];
    stopLoss?: number;
    takeProfit?: number;
    riskRewardRatio?: number;
  };
  studies: ReportSection[];
  evidenceTable: Array<{
    metric: string;
    value: string;
    interpretation: string;
  }>;
  sources: Source[];
  markdown: string;
};

function parseSources(value: string): Source[] {
  try {
    const parsed = JSON.parse(value) as Array<{ title?: string; url?: string }>;
    return parsed.map((source) => ({
      title: source.title ?? "Supplied source",
      url: source.url ?? "#",
      reliability: source.url && source.url !== "#" ? "medium" : "low"
    }));
  } catch {
    return [];
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function money(value?: number | null) {
  return value === undefined || value === null ? "Unavailable" : `$${value.toFixed(2)}`;
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function guidanceFor(input: {
  score: number;
  riskLevel: string;
  dailyChangePercent: number;
  relativeVolume: number;
  confidence: number;
}) {
  if (input.riskLevel === "High" || input.dailyChangePercent > 20 || input.score < 60) {
    return {
      stance: "Avoid for now" as const,
      confidence: Math.min(input.confidence, 70),
      reason: "The setup fails one or more risk guardrails."
    };
  }

  if (input.score >= 75 && input.relativeVolume >= 1.5) {
    return {
      stance: "Paper-trade candidate" as const,
      confidence: input.confidence,
      reason: "The setup is strong enough for paper-trading review if risk controls pass."
    };
  }

  return {
    stance: "Watchlist only" as const,
    confidence: Math.min(input.confidence, 72),
    reason: "The setup needs more confirmation before any simulated entry."
  };
}

function toMarkdown(report: Omit<DocumentedInvestmentReport, "markdown">) {
  const lines = [
    `# ${report.ticker} Documented Investment Research Report`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Disclosure: ${report.disclosure}`,
    "",
    "## Executive Summary",
    report.executiveSummary,
    "",
    "## Guidance",
    `- Stance: ${report.guidance.stance}`,
    `- Time horizon: ${report.guidance.timeHorizon}`,
    `- Confidence: ${report.guidance.confidence}%`,
    `- Stop loss: ${money(report.guidance.stopLoss)}`,
    `- Take profit: ${money(report.guidance.takeProfit)}`,
    `- Risk/reward: ${report.guidance.riskRewardRatio ? `${report.guidance.riskRewardRatio.toFixed(2)}:1` : "Unavailable"}`,
    "",
    "### Reasoning",
    ...report.guidance.reasoning.map((item) => `- ${item}`),
    "",
    "### Conditions Before Action",
    ...report.guidance.conditionsBeforeAction.map((item) => `- ${item}`),
    "",
    "### Invalidation Conditions",
    ...report.guidance.invalidationConditions.map((item) => `- ${item}`),
    "",
    "### Risk Controls",
    ...report.guidance.riskControls.map((item) => `- ${item}`),
    "",
    "## Evidence Table",
    "| Metric | Value | Interpretation |",
    "| --- | --- | --- |",
    ...report.evidenceTable.map((row) => `| ${row.metric} | ${row.value} | ${row.interpretation} |`),
    "",
    "## Studies",
    ...report.studies.flatMap((section) => [
      `### ${section.title}`,
      ...section.findings.map((finding) => `- ${finding}`),
      ""
    ]),
    "## Sources",
    ...report.sources.map((source) => `- ${source.title} (${source.reliability}) - ${source.url}`),
    "",
    "This report is educational decision support for paper trading. It is not personalized financial advice."
  ];

  return lines.join("\n");
}

export async function generateDocumentedInvestmentReport(ticker: string, market?: MarketMode): Promise<DocumentedInvestmentReport> {
  const selectedMarket = normalizeMarketMode(market);
  const assetType = assetTypeForMarket(selectedMarket);
  const symbol = ticker.toUpperCase();
  const stock = await marketDataProvider.getStock(symbol, selectedMarket);
  if (!stock) throw new Error("Asset not found.");

  const signal = await prisma.marketSignal.findFirst({
    where: { ticker: symbol, assetType },
    orderBy: { createdAt: "desc" }
  });

  const existingReport = await prisma.researchReport.findFirst({
    where: { ticker: symbol, assetType },
    orderBy: { createdAt: "desc" }
  });
  const report = existingReport ?? (await generateResearchReport(stock, signal ?? undefined));
  const savedReport =
    "id" in report
      ? report
      : await prisma.researchReport.create({
          data: {
            assetType,
            ticker: report.ticker.toUpperCase(),
            companyName: report.companyName,
            summary: report.summary,
            whyDetected: report.whyDetected,
            bullCase: report.bullCase,
            bearCase: report.bearCase,
            risks: report.risks,
            fundamentals: report.fundamentals,
            valuationComment: report.valuationComment,
            technicalPicture: report.technicalPicture,
            catalysts: report.catalysts,
            aiScore: report.aiScore,
            confidence: report.confidence,
            riskLevel: report.riskLevel,
            decision: report.decision,
            sourcesJson: JSON.stringify(report.sources),
            scoreBreakdownJson: report.scoreBreakdownJson,
            checklistJson: report.checklistJson,
            strategyName: report.strategyName,
            strategyStatus: report.strategyStatus,
            researchQuality: report.researchQuality,
            noTradeReasonsJson: report.noTradeReasonsJson,
            evidenceJson: report.evidenceJson,
            strategyProofJson: report.strategyProofJson,
            dataSource: report.dataSource,
            catalystSource: report.catalystSource,
            priceDataSource: report.priceDataSource,
            researchProvider: report.researchProvider,
            aiProviderUsed: report.aiProviderUsed,
            confidenceQuality: report.confidenceQuality,
            limitationsJson: report.limitationsJson,
            aiMode: report.aiMode
          }
        });

  const [latestAnalysis, latestPlan, riskEvents, learningSummary, openTrade] = await Promise.all([
    prisma.aIAnalysis.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } }),
    prisma.tradePlan.findFirst({ where: { ticker: symbol, assetType }, orderBy: { createdAt: "desc" } }),
    prisma.riskEvent.findMany({ where: { ticker: symbol, assetType }, orderBy: { createdAt: "desc" }, take: 5 }),
    getLearningSummary(assetType),
    prisma.paperTrade.findFirst({ where: { ticker: symbol, assetType, status: "Open" }, orderBy: { openedAt: "desc" } })
  ]);

  const score = signal?.score ?? savedReport.aiScore ?? scoreStock(stock);
  const riskLevel = signal?.riskLevel ?? savedReport.riskLevel ?? getRiskLevel(stock);
  const scoreBreakdown = parseJson<Array<{ label: string; score: number; max: number; detail?: string }>>(savedReport.scoreBreakdownJson, []);
  const checklist = parseJson<Array<{ label: string; passed: boolean; detail?: string }>>(savedReport.checklistJson, []);
  const noTradeReasons = parseJson<string[]>(savedReport.noTradeReasonsJson, []);
  const strategyProof = parseJson<{
    strategyName?: string;
    status?: string;
    backtestTrades?: number;
    paperTrades?: number;
    winRate?: number;
    profitFactor?: number;
    maxDrawdown?: number;
    summary?: string;
  }>(savedReport.strategyProofJson, {});
  const evidence = parseJson<{
    dataSource?: string;
    priceDataSource?: string;
    catalystSource?: string;
    researchProvider?: string;
    aiProviderUsed?: string;
    researchQuality?: string;
    limitations?: string[];
  }>(savedReport.evidenceJson, {});
  const relativeVolume = Number((stock.volume / stock.avgVolume).toFixed(2));
  const guidance = guidanceFor({
    score,
    riskLevel,
    dailyChangePercent: stock.dailyChangePercent,
    relativeVolume,
    confidence: savedReport.confidence
  });
  const stopLoss = latestPlan?.stopLoss ?? Number((stock.price * 0.94).toFixed(2));
  const takeProfit = latestPlan?.takeProfit ?? Number((stock.price + (stock.price - stopLoss) * 2).toFixed(2));
  const riskRewardRatio = latestPlan?.riskRewardRatio ?? 2;

  const baseReport = {
    ticker: symbol,
    companyName: stock.companyName,
    assetClass: selectedMarket === "crypto" ? ("crypto" as const) : ("stocks" as const),
    generatedAt: new Date().toISOString(),
    disclosure:
      "This is a research and paper-trading system, not financial advice. Paper trading results do not guarantee real trading results. Real trading is disabled.",
    executiveSummary:
      `${stock.companyName} is rated as ${guidance.stance.toLowerCase()} based on deterministic scanner data, ` +
      `${latestAnalysis?.provider ?? "technical"} explanation, risk guardrails, and a ${savedReport.researchQuality} stored research report. ` +
      `Final scanner decision: ${professionalDecisionLabel(savedReport.decision)}.`,
    guidance: {
      stance: guidance.stance,
      timeHorizon: selectedMarket === "crypto" ? "short-term crypto paper-trading review" : "short-term stock paper-trading review",
      confidence: guidance.confidence,
      reasoning: [
        guidance.reason,
        `Scanner score is ${score}, which maps to "${professionalDecisionLabel(getDecision(score))}".`,
        `Risk level is ${riskLevel}; automatic paper trading blocks High-risk candidates.`,
        `Strategy gate: ${savedReport.strategyName} is ${savedReport.strategyStatus}.`,
        `Research mode: ${savedReport.aiMode}.`,
        latestAnalysis
          ? `Latest analysis provider: ${latestAnalysis.provider} using ${latestAnalysis.model}; recommendation ${latestAnalysis.recommendation}.`
          : "No external provider analysis is required; technical-only logic can continue."
      ],
      conditionsBeforeAction: [
        "Use paper trading only; real-money trading remains disabled.",
        "Confirm current price is still near the report price before creating or approving a paper plan.",
        "Confirm relative volume remains above the configured threshold.",
        "Create a paper trade plan and let the risk engine approve stop-loss, take-profit, max-open-trades, and daily-loss rules."
      ],
      invalidationConditions: [
        `Price falls below the planned stop area near ${money(stopLoss)}.`,
        "Relative volume fades below the configured threshold.",
        "New data contradicts the catalyst, trend, or risk assumptions.",
        "The risk engine creates a blocking risk event."
      ],
      riskControls: [
        "Paper trading only.",
        "Never bypass the risk engine with an AI response.",
        "Risk per trade is limited by user settings.",
        "No automatic real broker live orders are allowed.",
        openTrade ? "There is already an open paper trade for this symbol." : "No open paper trade was found for this symbol."
      ],
      stopLoss,
      takeProfit,
      riskRewardRatio
    },
    studies: [
      {
        title: "Market Data Study",
        findings: [
          `Current price is ${money(stock.price)} versus previous close ${money(stock.previousClose)}.`,
          `Daily change is ${stock.dailyChangePercent.toFixed(2)}%.`,
          `Volume is ${compact(stock.volume)} versus average volume ${compact(stock.avgVolume)}.`,
          `Relative volume is ${relativeVolume.toFixed(2)}x.`
        ]
      },
      {
        title: "Professional Score Breakdown",
        findings: scoreBreakdown.length
          ? scoreBreakdown.map((item) => `${item.label}: ${item.score}/${item.max}. ${item.detail ?? ""}`.trim())
          : ["Score breakdown was not stored for this report."]
      },
      {
        title: "Professional Checklist",
        findings: checklist.length
          ? checklist.map((item) => `${item.passed ? "Passed" : "Not passed"} - ${item.label}. ${item.detail ?? ""}`.trim())
          : ["Checklist was not stored for this report."]
      },
      {
        title: "Strategy Proof",
        findings: [
          `Strategy: ${savedReport.strategyName}.`,
          `Status: ${savedReport.strategyStatus}.`,
          `Backtest trades: ${strategyProof.backtestTrades ?? 0}.`,
          `Paper trades: ${strategyProof.paperTrades ?? 0}.`,
          `Win rate: ${(strategyProof.winRate ?? 0).toFixed(1)}%.`,
          `Profit factor: ${(strategyProof.profitFactor ?? 0).toFixed(2)}.`,
          strategyProof.summary ?? "Strategy proof is still collecting data."
        ]
      },
      {
        title: "No-Trade Review",
        findings: noTradeReasons.length
          ? noTradeReasons
          : ["No trade-blocking reason was stored, but risk-engine approval is still required before any paper trade."]
      },
      {
        title: "Technical Study",
        findings: [
          signal?.explanation ?? savedReport.technicalPicture,
          `Detected signal type: ${signal?.signalType ?? "stored research signal"}.`,
          `Risk interpretation: ${riskLevel}.`
        ]
      },
      {
        title: "Research Quality And Evidence",
        findings: [
          `Research quality: ${savedReport.researchQuality}.`,
          `AI mode: ${savedReport.aiMode}.`,
          `Data source: ${savedReport.dataSource || evidence.dataSource || "Unknown"}.`,
          `Price source: ${savedReport.priceDataSource || evidence.priceDataSource || "Unknown"}.`,
          `Catalyst source: ${savedReport.catalystSource || evidence.catalystSource || "Unknown"}.`,
          `Research provider: ${savedReport.researchProvider || evidence.researchProvider || "TradePilot rules"}.`,
          `AI provider used: ${savedReport.aiProviderUsed || evidence.aiProviderUsed || "none"}.`,
          ...(evidence.limitations ?? ["No additional limitations were stored."])
        ]
      },
      {
        title: "Fundamental And Valuation Study",
        findings: [savedReport.fundamentals, savedReport.valuationComment]
      },
      {
        title: "Bull/Bear Study",
        findings: [savedReport.bullCase, savedReport.bearCase, savedReport.risks]
      },
      {
        title: "Learning Engine Context",
        findings: [
          `Stored prediction count: ${learningSummary.predictionCount}.`,
          `Current win rate estimate: ${learningSummary.winRate.toFixed(1)}%.`,
          learningSummary.performance?.bestSector
            ? `Best observed sector: ${learningSummary.performance.bestSector}.`
            : "Best sector is still collecting data.",
          learningSummary.performance?.worstSector
            ? `Worst observed sector: ${learningSummary.performance.worstSector}.`
            : "Worst sector is still collecting data."
        ]
      },
      {
        title: "Risk Engine Findings",
        findings: riskEvents.length
          ? riskEvents.map((event) => `${event.severity}: ${event.message}`)
          : ["No recent blocking risk event found for this symbol."]
      }
    ],
    evidenceTable: [
      { metric: "Scanner score", value: String(score), interpretation: professionalDecisionLabel(getDecision(score)) },
      { metric: "Professional decision", value: professionalDecisionLabel(savedReport.decision), interpretation: "Deterministic decision engine output" },
      { metric: "Research quality", value: savedReport.researchQuality, interpretation: savedReport.aiMode },
      { metric: "Strategy status", value: savedReport.strategyStatus, interpretation: savedReport.strategyName },
      { metric: "Risk level", value: riskLevel, interpretation: riskLevel === "High" ? "Blocked from automatic paper trading" : "Can continue to risk review" },
      { metric: "Relative volume", value: `${relativeVolume.toFixed(2)}x`, interpretation: relativeVolume >= 1.5 ? "Liquidity confirms attention" : "Liquidity needs improvement" },
      { metric: "Daily move", value: `${stock.dailyChangePercent.toFixed(2)}%`, interpretation: stock.dailyChangePercent > 20 ? "Chase risk is too high" : "Within risk guardrail" },
      { metric: "Provider", value: latestAnalysis?.provider ?? "technical", interpretation: latestAnalysis?.technicalOnly ? "Technical-only mode used" : "External/provider analysis available" },
      { metric: "Plan stop", value: money(stopLoss), interpretation: "Must exist before paper trade approval" },
      { metric: "Plan target", value: money(takeProfit), interpretation: "Must keep risk/reward at least 2:1" }
    ],
    sources: [
      ...parseSources(savedReport.sourcesJson),
      { title: "TradePilot deterministic scanner", url: "#", reliability: "medium" as const },
      { title: "TradePilot risk engine", url: "#", reliability: "medium" as const },
      { title: "TradePilot learning engine", url: "#", reliability: learningSummary.predictionCount ? ("medium" as const) : ("low" as const) }
    ]
  };

  return {
    ...baseReport,
    markdown: toMarkdown(baseReport)
  };
}
