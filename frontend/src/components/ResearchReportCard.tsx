import { Brain, ExternalLink } from "lucide-react";
import { parseSources } from "../lib/api";
import type { ResearchReport } from "../lib/types";
import { DecisionBadge, RiskBadge, ScoreBadge } from "./Badges";
import { ProfessionalPanels } from "./ProfessionalPanels";

export function ResearchReportCard({ report }: { report: ResearchReport }) {
  const sources = parseSources(report);
  const sections = [
    ["Why detected", report.whyDetected],
    ["Bull case", report.bullCase],
    ["Bear case", report.bearCase],
    ["Risks", report.risks],
    ["Fundamentals", report.fundamentals],
    ["Valuation", report.valuationComment],
    ["Technical picture", report.technicalPicture],
    ["Catalysts", report.catalysts]
  ];

  return (
    <section className="rounded-lg border border-berry/25 bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-200">
            <Brain className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Professional Research Report</h3>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-300">{report.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScoreBadge score={report.aiScore} />
          <RiskBadge risk={report.riskLevel} />
          <DecisionBadge decision={report.decision} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sections.map(([title, content]) => (
          <article key={title} className="rounded-lg border border-line bg-white/[0.03] p-4">
            <h4 className="text-sm font-semibold text-stone-100">{title}</h4>
            <p className="mt-2 text-sm leading-6 text-stone-400">{content}</p>
          </article>
        ))}
      </div>

      <div className="mt-5">
        <ProfessionalPanels
          scoreBreakdownJson={report.scoreBreakdownJson}
          checklistJson={report.checklistJson}
          noTradeReasonsJson={report.noTradeReasonsJson}
          strategyProofJson={report.strategyProofJson}
          evidenceJson={report.evidenceJson}
          researchQuality={report.researchQuality}
          aiMode={report.aiMode}
          strategyName={report.strategyName}
          strategyStatus={report.strategyStatus}
        />
      </div>

      <div className="mt-5 rounded-lg border border-line bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-stone-100">Sources</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((source) => (
            <a
              key={source.title}
              href={source.url}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-stone-300 hover:bg-white/6"
            >
              {source.title}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
