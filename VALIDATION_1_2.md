# TradePilot 1.2 Validation

Validated on July 12, 2026.

## Automated checks

- Backend TypeScript check: passed
- Frontend TypeScript check: passed
- Backend production build: passed
- Frontend production build: passed
- Backend test suite: 21/21 passed
- Python source compilation: passed
- SQLite integrity check: passed
- SQLite foreign-key check: passed

The frontend production build emits a non-blocking bundle-size warning for the main JavaScript chunk.

## Strategy integrity checks

- One deterministic strategy controls stock scanning, risk approval, trade planning, and daily-signal backtesting.
- Static catalyst, valuation, and market-cap fields cannot rescue an invalid automatic entry.
- Live entries require fresh executable quotes and regular US market hours.
- Time-adjusted intraday volume is used when enough sessions are available.
- Stops, targets, and quantity are refreshed before entry without exceeding the approved maximum loss.
- AI output is research commentary and cannot override deterministic strategy or risk rules.
- Automatic crypto trading and all real-money trading remain disabled.

## Clean bundled state

- Paper account reset to USD 500
- No paper trades or positions
- No trade plans
- No stored backtests or strategy-performance records
- No broker account connection or account number
- No `.env` credentials
- Generated dependencies and build folders excluded from the ZIP
