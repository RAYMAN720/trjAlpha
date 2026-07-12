# TradePilot 1.1 — Safety and Risk-Control Update

## Execution integrity

- Manual close requests use a fresh quote fetched by the backend.
- Public endpoints ignore browser-supplied execution prices.
- Manual stock closes enforce regular US market hours and exchange holidays.
- Price-refresh requests also use server-side trusted quotes.

## New circuit breakers

Defaults can be changed in `backend/.env`:

```env
MAX_DAILY_PAPER_TRADES=6
MAX_CONSECUTIVE_LOSSES=3
MAX_WEEKLY_LOSS_PERCENT=6
MAX_ACCOUNT_DRAWDOWN_PERCENT=10
MAX_OPEN_TRADES_PER_SECTOR=2
```

After two consecutive losses, new paper-trade risk is automatically reduced by 50%. At the configured loss-streak threshold, new entries pause.

## Validation

- Backend TypeScript check: passed
- Frontend TypeScript check: passed
- Backend tests: 17 passed
- Backend production build: passed
- Frontend production build: passed
- Real-money trading: still disabled
