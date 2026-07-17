import { Gauge } from "lucide-react";

function parseExecution(json?: string | null) {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed.execution ?? parsed.professional?.execution ?? null;
  } catch {
    return null;
  }
}

export function ExecutionQualityPanel({ professionalJson }: { professionalJson?: string | null }) {
  const execution = parseExecution(professionalJson);
  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-caution" />
        <h3 className="text-lg font-semibold text-stone-50">Execution Quality</h3>
      </div>
      {execution ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Grade" value={execution.executionGrade ?? "-"} />
          <Metric label="Entry quality" value={`${execution.entryQuality ?? 0}/100`} />
          <Metric label="Chase risk" value={execution.chaseRisk ?? "unknown"} />
          {execution.warnings?.length ? (
            <div className="sm:col-span-3 rounded-lg border border-caution/25 bg-caution/10 p-3 text-sm text-amber-100">
              {execution.warnings.slice(0, 3).join(" ")}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-stone-400">Execution grade appears after a professional trade plan is created.</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-stone-50">{value}</p>
    </div>
  );
}
