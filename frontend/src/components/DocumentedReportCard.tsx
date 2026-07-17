import { Clipboard, Download, FileText, ShieldAlert } from "lucide-react";
import { dateShort, usd } from "../lib/format";
import type { DocumentedInvestmentReport } from "../lib/types";
import { SafetyBadge } from "./Badges";

function stanceTone(stance: DocumentedInvestmentReport["guidance"]["stance"]): "green" | "amber" | "red" {
  if (stance === "Paper-trade candidate") return "green";
  if (stance === "Watchlist only") return "amber";
  return "red";
}

function saveMarkdown(report: DocumentedInvestmentReport) {
  const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.ticker}-documented-research.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DocumentedReportCard({ report }: { report: DocumentedInvestmentReport }) {
  const guidanceSections: Array<[string, string[]]> = [
    ["Reasoning", report.guidance.reasoning],
    ["Conditions before action", report.guidance.conditionsBeforeAction],
    ["Invalidation", report.guidance.invalidationConditions],
    ["Risk controls", report.guidance.riskControls]
  ];

  return (
    <section className="rounded-lg border border-mint/20 bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-mint">
            <FileText className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Documented Research Report</h3>
          </div>
          <p className="mt-2 text-sm text-stone-500">Generated {dateShort(report.generatedAt)}</p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-300">{report.executiveSummary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SafetyBadge label={report.guidance.stance} tone={stanceTone(report.guidance.stance)} />
          <SafetyBadge label={`${report.guidance.confidence}% confidence`} tone="purple" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-caution/25 bg-caution/10 p-3 text-sm text-amber-100">
        <ShieldAlert className="h-4 w-4" />
        {report.disclosure}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Time horizon</p>
          <p className="mt-2 font-semibold text-stone-100">{report.guidance.timeHorizon}</p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Stop / target</p>
          <p className="mt-2 font-semibold text-stone-100">
            {report.guidance.stopLoss ? usd.format(report.guidance.stopLoss) : "N/A"} /{" "}
            {report.guidance.takeProfit ? usd.format(report.guidance.takeProfit) : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Risk reward</p>
          <p className="mt-2 font-semibold text-stone-100">
            {report.guidance.riskRewardRatio ? `${report.guidance.riskRewardRatio.toFixed(2)}:1` : "Unavailable"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {guidanceSections.map(([title, items]) => (
          <article key={title} className="rounded-lg border border-line bg-white/[0.03] p-4">
            <h4 className="text-sm font-semibold text-stone-100">{title}</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-400">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-white/[0.03] scrollbar-thin">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-stone-500">
            <tr>
              <th className="px-4 py-3">Metric</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.evidenceTable.map((row) => (
              <tr key={row.metric}>
                <td className="px-4 py-3 font-semibold text-stone-100">{row.metric}</td>
                <td className="px-4 py-3 text-stone-300">{row.value}</td>
                <td className="px-4 py-3 text-stone-400">{row.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report.studies.map((section) => (
          <article key={section.title} className="rounded-lg border border-line bg-white/[0.03] p-4">
            <h4 className="text-sm font-semibold text-stone-100">{section.title}</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-400">
              {section.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-line bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-stone-100">Sources</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.sources.map((source) => (
            <span key={`${source.title}-${source.url}`} className="rounded-lg border border-line px-3 py-2 text-sm text-stone-300">
              {source.title} - {source.reliability}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90"
          onClick={() => saveMarkdown(report)}
        >
          <Download className="h-4 w-4" />
          Download Markdown
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6"
          onClick={() => navigator.clipboard?.writeText(report.markdown)}
        >
          <Clipboard className="h-4 w-4" />
          Copy Markdown
        </button>
      </div>
    </section>
  );
}
