import { Activity, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { dateShort } from "../../lib/format";
import type { PaperTradeEvent } from "../../lib/types";

function iconFor(eventType: string) {
  if (eventType.includes("buy") || eventType.includes("opened")) return CheckCircle2;
  if (eventType.includes("sell") || eventType.includes("closed")) return XCircle;
  if (eventType.includes("risk") || eventType.includes("blocked")) return ShieldAlert;
  return Activity;
}

export function TradeActivityFeed({ events }: { events: PaperTradeEvent[] }) {
  return (
    <section className="rounded-lg border border-line bg-panel/88 p-5 shadow-glow">
      <h3 className="text-lg font-semibold text-stone-50">Live Activity Feed</h3>
      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
        {events.length ? events.map((event) => {
          const Icon = iconFor(event.eventType);
          return (
            <div key={event.id} className="flex gap-3 rounded-lg border border-line bg-white/[0.03] p-3">
              <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-mint/20 bg-mint/10 text-mint">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-100">{event.ticker} - {event.eventType.replace(/_/g, " ")}</p>
                <p className="mt-1 text-sm leading-5 text-stone-400">{event.message}</p>
                <p className="mt-1 text-xs text-stone-600">{dateShort(event.createdAt)}</p>
              </div>
            </div>
          );
        }) : <p className="text-sm text-stone-400">No activity yet. Paper scans, buys, sells, and risk blocks will appear here.</p>}
      </div>
    </section>
  );
}
