import {
  BarChart3,
  BookOpenText,
  Bot,
  Building2,
  ClipboardList,
  ClipboardCheck,
  Coins,
  Lightbulb,
  LineChart,
  Menu,
  Newspaper,
  PieChart,
  RadioTower,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  Siren,
  Target,
  Trophy,
  WalletCards,
  X
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useMarketMode, type MarketMode } from "../lib/marketMode";

const navGroups = [
  {
    label: "Stocks",
    items: [
      { to: "/stocks", label: "Stock Dashboard", icon: BarChart3 },
      { to: "/stocks/scanner", label: "Stock Scanner", icon: LineChart },
      { to: "/stocks/paper-trading", label: "Stock Paper Trading", icon: WalletCards },
      { to: "/stocks/paper-trading/live", label: "Stock Live Terminal", icon: RadioTower },
      { to: "/stocks/portfolio", label: "Stock Portfolio", icon: PieChart },
      { to: "/stocks/news", label: "Stock News", icon: Newspaper },
      { to: "/stocks/watchlist", label: "Stock Watchlist", icon: Star },
      { to: "/stocks/learning", label: "Stock Learning", icon: Lightbulb },
      { to: "/stocks/alerts", label: "Stock Alerts", icon: Siren },
      { to: "/stocks/reports", label: "Stock Reports", icon: ClipboardList }
    ]
  },
  {
    label: "Crypto",
    items: [
      { to: "/crypto", label: "Crypto Dashboard", icon: Coins },
      { to: "/crypto/scanner", label: "Crypto Scanner", icon: LineChart },
      { to: "/crypto/paper-trading", label: "Crypto Paper Trading", icon: WalletCards },
      { to: "/crypto/paper-trading/live", label: "Crypto Live Terminal", icon: RadioTower },
      { to: "/crypto/portfolio", label: "Crypto Portfolio", icon: PieChart },
      { to: "/crypto/news", label: "Crypto News", icon: Newspaper },
      { to: "/crypto/watchlist", label: "Crypto Watchlist", icon: Star },
      { to: "/crypto/learning", label: "Crypto Learning", icon: Lightbulb },
      { to: "/crypto/alerts", label: "Crypto Alerts", icon: Siren },
      { to: "/crypto/reports", label: "Crypto Reports", icon: ClipboardList }
    ]
  },
  {
    label: "System",
    items: [
      { to: "/", label: "Overview", icon: BarChart3 },
      { to: "/automation", label: "Automation Center", icon: RadioTower },
      { to: "/professional", label: "Professional Desk", icon: ShieldCheck },
      { to: "/agents", label: "Agent Activity", icon: Bot },
      { to: "/playbooks", label: "Strategy Lab", icon: ClipboardCheck },
      { to: "/strategy", label: "Strategy Performance", icon: Target },
      { to: "/benchmark", label: "Benchmark", icon: Trophy },
      { to: "/reports/weekly", label: "Weekly Report", icon: ClipboardList },
      { to: "/broker", label: "Broker Center", icon: Building2 },
      { to: "/journal", label: "Journal", icon: BookOpenText },
      { to: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

function Sidebar({ close }: { close?: () => void }) {
  return (
    <aside className="flex h-full w-72 flex-col overflow-y-auto border-r border-line bg-ink/96 p-4 scrollbar-thin">
      <div className="flex items-center justify-between gap-3 px-2 py-3">
        <div>
          <p className="text-lg font-semibold text-stone-50">TradePilot AI</p>
          <p className="text-xs uppercase tracking-[0.2em] text-mint">Scanner</p>
        </div>
        {close ? (
          <button className="rounded-lg border border-line p-2 text-stone-300" onClick={close} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="mt-6 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">{group.label}</p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/" || item.to === "/stocks" || item.to === "/crypto"}
                  onClick={close}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                      isActive
                        ? "border border-mint/30 bg-mint/12 text-mint"
                        : "text-stone-400 hover:bg-white/6 hover:text-stone-100"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-lg border border-caution/25 bg-caution/10 p-3 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-4 w-4" />
          Paper Broker Mode
        </div>
        <p className="mt-2 text-xs leading-5 text-amber-100/80">Alpaca paper execution enabled. Real-money trading locked off.</p>
      </div>
    </aside>
  );
}

export function Header({ openMenu }: { openMenu: () => void }) {
  const { marketMode, setMarketMode } = useMarketMode();
  const navigate = useNavigate();
  const location = useLocation();
  const modes: Array<{ value: MarketMode; label: string }> = [
    { value: "stocks", label: "Stocks" },
    { value: "crypto", label: "Crypto" }
  ];

  function equivalentPath(nextMode: MarketMode) {
    const currentBase = location.pathname.startsWith("/crypto") ? "/crypto" : location.pathname.startsWith("/stocks") ? "/stocks" : "";
    if (!currentBase) return nextMode === "crypto" ? "/crypto" : "/stocks";
    const suffix = location.pathname.slice(currentBase.length);
    const nextBase = nextMode === "crypto" ? "/crypto" : "/stocks";
    if (!suffix || suffix === "/") return nextBase;
    const firstSegment = suffix.split("/")[1];
    const sharedSections = new Set(["scanner", "paper-trading", "portfolio", "news", "watchlist", "learning", "alerts", "reports"]);
    if (!sharedSections.has(firstSegment)) return nextBase;
    return suffix.startsWith("/paper-trading/live") ? `${nextBase}/paper-trading/live` : `${nextBase}/${firstSegment}`;
  }

  function switchMode(nextMode: MarketMode) {
    setMarketMode(nextMode);
    navigate(equivalentPath(nextMode));
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/82 px-4 py-3 backdrop-blur md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button className="rounded-lg border border-line p-2 text-stone-200 lg:hidden" onClick={openMenu} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-stone-50 md:text-2xl">TradePilot AI Scanner</h1>
          <p className="text-sm text-stone-400">Research, risk plans, and Alpaca paper trading for {marketMode === "crypto" ? "crypto" : "stocks"}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white/[0.04] p-1">
            {modes.map((mode) => (
              <button
                key={mode.value}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                  marketMode === mode.value ? "bg-mint text-ink" : "text-stone-400 hover:bg-white/6 hover:text-stone-100"
                }`}
                onClick={() => switchMode(mode.value)}
              >
                {mode.value === "crypto" ? <Coins className="h-4 w-4" /> : <LineChart className="h-4 w-4" />}
                {mode.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5 text-sm font-semibold text-mint sm:flex">
            <Shield className="h-4 w-4" />
            Paper Trading Only
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { marketMode } = useMarketMode();
  const base = marketMode === "crypto" ? "/crypto" : "/stocks";
  const bottomItems = [
    { to: base, label: "Dashboard", icon: BarChart3 },
    { to: `${base}/scanner`, label: "Markets", icon: LineChart },
    { to: `${base}/paper-trading/live`, label: "Live", icon: RadioTower },
    { to: `${base}/portfolio`, label: "Portfolio", icon: PieChart },
    { to: `${base}/news`, label: "News", icon: Newspaper },
    { to: "/settings", label: "Settings", icon: Settings }
  ];

  return (
    <div className="min-h-screen pb-20 text-stone-100 lg:pb-0">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar />
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full" onClick={(event) => event.stopPropagation()}>
            <Sidebar close={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <main className="lg:pl-72">
        <Header openMenu={() => setOpen(true)} />
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-ink/96 px-1 py-2 backdrop-blur lg:hidden">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === base}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[0.65rem] font-semibold ${
                isActive ? "bg-mint/12 text-mint" : "text-stone-500"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
