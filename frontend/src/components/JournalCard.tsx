import { BookOpenText } from "lucide-react";
import type { JournalEntry } from "../lib/types";
import { dateShort } from "../lib/format";

export function JournalCard({ entry, onReview }: { entry: JournalEntry; onReview?: (entry: JournalEntry) => void }) {
  return (
    <article className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-berry/25 bg-berry/10 p-2 text-purple-200">
            <BookOpenText className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-stone-50">{entry.ticker}</h3>
            <p className="text-sm text-stone-500">{dateShort(entry.createdAt)}</p>
          </div>
        </div>
        <span className="rounded-full border border-line bg-white/5 px-3 py-1 text-xs font-semibold text-stone-200">{entry.result}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <p className="text-sm leading-6 text-stone-300">
          <span className="font-semibold text-stone-100">Decision:</span> {entry.decision}
        </p>
        <p className="text-sm leading-6 text-stone-300">
          <span className="font-semibold text-stone-100">Emotion:</span> {entry.emotion}
        </p>
        <p className="text-sm leading-6 text-stone-300">
          <span className="font-semibold text-stone-100">Entry:</span> {entry.entryReason}
        </p>
        <p className="text-sm leading-6 text-stone-300">
          <span className="font-semibold text-stone-100">Lesson:</span> {entry.lesson}
        </p>
      </div>

      {entry.aiReview ? (
        <p className="mt-4 rounded-lg border border-berry/25 bg-berry/10 p-4 text-sm leading-6 text-purple-100">{entry.aiReview}</p>
      ) : null}

      {onReview ? (
        <button
          className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-semibold text-stone-200 hover:bg-white/6"
          onClick={() => onReview(entry)}
        >
          AI Review
        </button>
      ) : null}
    </article>
  );
}
