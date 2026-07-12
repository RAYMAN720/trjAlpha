# TradePilot 1.2 — Trend Breakout V2

This release focuses on strategy quality and data integrity rather than trade frequency.

## Core strategy

- One deterministic long-only stock strategy replaces mixed momentum, rebound, sector, and static-catalyst entries.
- SPY SMA50/SMA200 market-regime filter.
- Price > EMA20 > EMA50 > SMA200 with positive EMA20 slope.
- Genuine prior-20-day-high breakout.
- Minimum 1.35x time-adjusted intraday volume when enough sessions exist; daily-volume fallback for historical testing.
- Minimum 60-day relative strength versus SPY.
- Bar-derived average dollar volume of at least $50M; static catalyst, valuation, and market-cap fields do not rescue entries.
- ATR, RSI, candle-quality, gap, and chase-distance filters.
- 15-minute VWAP/EMA20 and hourly trend confirmation.
- Entry window limited to 10:00–15:30 ET.
- Exact deterministic score: 85/100 minimum, with every mandatory rule required.

## Trade management

- ATR/structure stop instead of a fixed percentage.
- Initial 2.5R target.
- Stop and quantity are recalculated from fresh data immediately before entry without exceeding the plan's maximum loss.
- Breakeven ratchet after +1R.
- ATR trailing stop after +1.5R.
- EMA20 trend exit and maximum holding-period exit.
- 48-hour stop-loss cooldown, 0.5% entry-drift limit, daily-trade, sector, weekly-loss, and drawdown defaults.
- AI provides research commentary only; deterministic rules remain authoritative.

## Validation

- Shared pure TypeScript daily signal evaluator for live analysis and walk-forward historical testing.
- Backtest uses next-bar entries, conservative stop-first ambiguity handling, 8 bps slippage each side, and 2 bps fees.
- Shared portfolio simulation allows at most three concurrent positions and one open position per sector.
- Performance is tracked by exact strategy name.
- Intraday VWAP/time-of-day execution is validated through forward paper trading rather than fabricated historical data.
- `PROVEN` requires at least 200 historical trades, 100 completed paper trades, historical profit factor >= 1.4, paper profit factor >= 1.3, and maximum drawdown <= 12%.

Automatic crypto paper trading and all real-money trading remain disabled. No strategy or backtest guarantees future profit.
