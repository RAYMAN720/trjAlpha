import { BookOpenText, Plus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { JournalCard } from "../components/JournalCard";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { api } from "../lib/api";
import type { JournalEntry } from "../lib/types";

const initialForm = {
  ticker: "",
  decision: "Watch",
  entryReason: "",
  exitReason: "",
  emotion: "Calm",
  mistake: "",
  lesson: "",
  result: "Open",
  aiReview: ""
};

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);

  async function load() {
    setEntries(await api.journal());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.addJournal(form);
    setForm(initialForm);
    await load();
  }

  async function review(entry: JournalEntry) {
    await api.reviewJournal(entry.id);
    await load();
  }

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">Decision review</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-50">Trade Journal</h2>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-mint" />
          <h3 className="text-lg font-semibold text-stone-50">New journal entry</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Ticker", "ticker"],
            ["Decision", "decision"],
            ["Entry reason", "entryReason"],
            ["Exit reason", "exitReason"],
            ["Emotion", "emotion"],
            ["Mistake", "mistake"],
            ["Lesson learned", "lesson"],
            ["Result", "result"]
          ].map(([label, key]) => (
            <label key={key} className="space-y-2 text-sm text-stone-300">
              <span>{label}</span>
              <input
                className="h-11 w-full rounded-lg border border-line bg-ink px-3 text-stone-100"
                value={form[key as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                required={["ticker", "decision", "entryReason", "emotion", "lesson", "result"].includes(key)}
              />
            </label>
          ))}
        </div>
        <button className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-semibold text-ink hover:bg-mint/90">
          <BookOpenText className="h-4 w-4" />
          Save Entry
        </button>
      </form>

      <div className="grid gap-4">
        {entries.map((entry) => (
          <JournalCard key={entry.id} entry={entry} onReview={review} />
        ))}
        {!entries.length ? <EmptyState icon={BookOpenText} title="No journal entries" description="Record decisions and review the process quality." /> : null}
      </div>
    </div>
  );
}
