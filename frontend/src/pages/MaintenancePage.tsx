import {
  Activity,
  BookOpenText,
  Brain,
  CheckCircle2,
  Clock3,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wrench
} from "lucide-react";

const projectNotes = [
  {
    icon: Brain,
    title: "Market intelligence",
    text: "TradePilot AI Scanner is being rebuilt as a structured research assistant for stocks and crypto, with AI summaries, scoring rules, and documented reasoning."
  },
  {
    icon: ShieldCheck,
    title: "Risk-first workflow",
    text: "The system keeps real-money trading disabled and focuses on paper trading, guardrails, position sizing, stop-loss discipline, and review before execution."
  },
  {
    icon: Activity,
    title: "Automation layer",
    text: "The next version is designed to scan markets, monitor watchlists, update simulated trades, and produce alerts while keeping a clear audit trail."
  },
  {
    icon: FileText,
    title: "Research documentation",
    text: "Every opportunity will be supported by a readable report covering the bull case, bear case, technical picture, risk notes, and decision status."
  }
];

const releaseItems = [
  "Cleaner stock and crypto dashboards",
  "Paper-trading only execution controls",
  "Documented research reports",
  "Learning and performance review pages",
  "Safer broker and LEAN engine integration"
];

export function MaintenancePage() {
  return (
    <main className="maintenance-shell">
      <section className="maintenance-hero" aria-labelledby="maintenance-title">
        <nav className="maintenance-nav" aria-label="Project status">
          <div className="maintenance-brand">
            <span className="maintenance-mark">
              <Sparkles className="h-5 w-5" />
            </span>
            <span>TradePilot AI Scanner</span>
          </div>
          <div className="maintenance-status-pill">
            <Wrench className="h-4 w-4" />
            Maintenance mode
          </div>
        </nav>

        <div className="maintenance-hero-grid">
          <div className="maintenance-copy">
            <p className="maintenance-kicker">Professional rebuild in progress</p>
            <h1 id="maintenance-title">Available very soon</h1>
            <p className="maintenance-lead">
              TradePilot AI Scanner is temporarily offline while the new version is being prepared, tested, and documented.
              The goal is a cleaner market research workspace with safer paper-trading workflows and clearer decision reports.
            </p>
            <div className="maintenance-actions" aria-label="Safety status">
              <span>
                <LockKeyhole className="h-4 w-4" />
                Paper trading only
              </span>
              <span>
                <ShieldCheck className="h-4 w-4" />
                Real trading disabled
              </span>
            </div>
          </div>

          <aside className="maintenance-panel" aria-label="Launch status">
            <div className="panel-header">
              <Clock3 className="h-5 w-5 text-mint" />
              <span>Launch status</span>
            </div>
            <div className="status-meter" aria-hidden="true">
              <span />
            </div>
            <dl className="status-list">
              <div>
                <dt>Current phase</dt>
                <dd>Final rebuild and documentation</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>Very soon</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>Rayan Tchamba</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="maintenance-section" aria-labelledby="documentation-title">
        <div className="section-heading">
          <BookOpenText className="h-5 w-5 text-mint" />
          <div>
            <p className="maintenance-kicker">Project documentation</p>
            <h2 id="documentation-title">What TradePilot is being built to do</h2>
          </div>
        </div>

        <div className="documentation-grid">
          {projectNotes.map((item) => {
            const Icon = item.icon;
            return (
              <article className="documentation-card" key={item.title}>
                <div className="documentation-icon">
                  <Icon className="h-5 w-5" />
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="maintenance-section maintenance-footer-grid" aria-labelledby="next-version-title">
        <div>
          <p className="maintenance-kicker">Next version</p>
          <h2 id="next-version-title">What is coming back online</h2>
          <p className="maintenance-muted">
            The app will return with a simpler, safer experience focused on research discipline, simulated trading, and transparent risk notes.
          </p>
        </div>
        <ul className="release-list">
          {releaseItems.map((item) => (
            <li key={item}>
              <CheckCircle2 className="h-4 w-4" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="maintenance-credit">
        <span>Author: Rayan Tchamba</span>
        <span>TradePilot AI Scanner</span>
      </footer>
    </main>
  );
}
