import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";

type ChecklistItem = {
  name?: string;
  label?: string;
  status: "PASS" | "WARNING" | "FAIL" | string;
  explanation?: string;
};

function parseChecklist(json?: string | null): ChecklistItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
    if (Array.isArray(parsed?.checklist?.items)) return parsed.checklist.items;
  } catch {
    return [];
  }
  return [];
}

function tone(status: string) {
  if (status === "PASS") return { Icon: CheckCircle2, className: "text-mint" };
  if (status === "FAIL") return { Icon: XCircle, className: "text-danger" };
  return { Icon: CircleAlert, className: "text-caution" };
}

export function ProfessionalChecklist({ checklistJson }: { checklistJson?: string | null }) {
  const items = parseChecklist(checklistJson);
  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <h3 className="text-lg font-semibold text-stone-50">Professional Checklist</h3>
      <div className="mt-4 space-y-2">
        {items.length ? items.slice(0, 20).map((item, index) => {
          const { Icon, className } = tone(item.status);
          return (
            <div key={`${item.name ?? item.label}-${index}`} className="flex gap-3 rounded-lg border border-line bg-white/[0.03] p-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
              <div>
                <p className="text-sm font-semibold text-stone-100">{item.name ?? item.label ?? "Checklist item"} <span className={className}>{item.status}</span></p>
                {item.explanation ? <p className="mt-1 text-xs text-stone-500">{item.explanation}</p> : null}
              </div>
            </div>
          );
        }) : <p className="text-sm text-stone-400">Create a trade plan or research report to populate the professional checklist.</p>}
      </div>
    </section>
  );
}
