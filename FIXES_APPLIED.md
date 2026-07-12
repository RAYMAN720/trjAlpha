# TradePilot Live-Data Safety Fixes

This build removes synthetic price movement from paper execution and learning.

## Main corrections

- Open paper positions update only from fresh Alpaca/Yahoo stock quotes or Binance crypto quotes.
- Static fallback data is display-only and cannot open, update, or close automated trades.
- US stock execution is blocked outside the regular New York session, on weekends, and on major exchange holidays.
- Stop-loss and take-profit exits use the observed market price rather than an invented threshold price.
- Charts and multi-timeframe analysis use real provider OHLCV candles for each timeframe.
- AI `reject` recommendations now stop execution.
- Each ticker is limited to one entry per trading session, with a configurable 24-hour cooldown after a stop-loss.
- Prediction outcomes use real 1-day, 7-day, and 30-day historical candles.
- Strategy metrics use closed trades only.
- Paper account positions and balances reconcile after every automation cycle, and orphan position records are removed.
- The bundled local database was reset to €500 with old synthetic trade, scan, and learning history removed.
- Real-money trading remains disabled.

## Validation completed

- Backend TypeScript check: passed
- Backend production build: passed
- Backend tests: 14 passed
- Frontend TypeScript check: passed
- Frontend production build: passed
- SQLite integrity and foreign-key checks: passed

## Required provider configuration

For the most reliable stock execution, configure Alpaca market-data credentials. Yahoo Finance remains the secondary stock quote and historical-candle source. Binance supplies crypto quotes and candles.

When no fresh trusted provider data is available, TradePilot records a blocked risk event and does not trade.

## Version 1.1 follow-up update

- Manual paper closes now execute only at a fresh server-fetched Alpaca/Yahoo/Binance quote.
- Client-provided `exitPrice` and `currentPrice` values are no longer trusted by public API routes.
- Added daily trade-count, consecutive-loss, weekly-loss, current-drawdown, and per-sector circuit breakers.
- Added automatic 50% risk-size reduction after two consecutive losses.
- Added expanded risk dashboard telemetry and three risk-streak unit tests.
- Project packages were bumped to version 1.1.0.
