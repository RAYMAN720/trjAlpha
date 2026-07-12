# TradePilot AI Scanner

TradePilot AI Scanner is a full-stack market scanner, research assistant, decision-support tool, and Alpaca paper-trading system. It helps users study market opportunities, generate cautious research reports, create risk-controlled paper trade plans, and review paper-trading decisions.

This MVP does **not** execute real-money trades, use leverage, or promise profit. Every workflow is built around research, risk, uncertainty, and paper trading.

The upgraded version also runs an autonomous paper-research loop. It scans live Alpaca/Yahoo/Binance data, generates structured agent activity, researches top candidates, updates paper trades only from fresh executable quotes, runs risk checks, creates alerts, and learns from verified historical market outcomes.

The functional broker-ready version adds an Alpaca Trading API connector. It supports real broker paper trading when Alpaca paper credentials are configured, while live real-money execution remains blocked by server-side guardrails.


## Version 1.2 Strategy Update

Version 1.2 replaces the mixed scanner rules with one selective, deterministic stock strategy: **Trend Breakout V2**. It is designed to reject most candidates rather than force frequent trades.

Automatic paper entries now require all of the following:

- liquid US stock: price at least $10 and bar-derived 20-day average dollar volume of at least $50M
- bullish SPY regime: price above SMA200, SMA50 above SMA200, and no material 20-day benchmark breakdown
- aligned stock trend: price above EMA20, EMA20 above EMA50, EMA50 above SMA200, with a rising EMA20
- a genuine close above the previous 20-day high
- volume of at least 1.35x the same time-of-day baseline when enough intraday history exists, otherwise the previous 20-day daily average
- 60-day relative strength at least 3 percentage points above SPY
- ATR between 1% and 6%, RSI between 52 and 72, and a high-quality breakout candle
- current price no more than 0.75 ATR above resistance
- 15-minute price above VWAP and EMA20, plus a bullish hourly trend
- entry time between 10:00 and 15:30 New York time
- deterministic score of at least 85/100

Stops are based on ATR and market structure rather than a fixed percentage. The initial target is 2.5R. After +1R, the stop moves above breakeven; after +1.5R, an ATR trailing stop begins. Trades also exit when the daily close loses EMA20 or the maximum holding period is reached.

The integrated TypeScript walk-forward backtester uses the same daily signal core, next-bar entries, a shared portfolio with at most three simultaneous positions and one position per sector, conservative stop-first intrabar assumptions, slippage, fees, and strategy-specific performance tracking. Intraday execution confirmation is validated through forward paper trading. A strategy cannot be marked `PROVEN` until it has at least 200 historical trades and 100 completed paper trades, historical profit factor of at least 1.4, paper profit factor of at least 1.3, and maximum drawdown no greater than 12%.

Crypto remains visible for research but automatic crypto paper trading is disabled in this focused strategy release. Real-money trading remains disabled.

## Version 1.1 Safety Update

This release hardens paper-trading integrity and loss protection:

- Browser clients can no longer submit arbitrary execution prices. Manual closes and price refreshes fetch a fresh approved provider quote on the server.
- Stock manual closes are blocked outside the regular US session, on weekends, and on exchange holidays.
- Daily trade-count, consecutive-loss, weekly-loss, account-drawdown, and sector-concentration circuit breakers are enforced.
- Two consecutive losses reduce new paper position size by 50%; the configured loss-streak threshold pauses new entries.
- The risk dashboard displays daily and weekly limits, drawdown, trade count, streak status, and the current size multiplier.
- Automatic and manual paper actions remain fail-closed whenever market data is stale, untrusted, or unavailable.

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, Recharts
- Backend: Node.js, Express, TypeScript, Prisma ORM, SQLite locally and Postgres for hosted deployment
- Python Engine: FastAPI microservice for indicators, multi-timeframe analysis, backtesting, risk checks, news scoring, and portfolio analytics
- Workers: node-cron in-process scheduler for MVP automation
- AI: optional OpenAI, optional Mistral, optional remote OpenAI-compatible model, optional Ollama, then deterministic technical-only mode
- Market data: Alpaca and Yahoo Finance for stocks, Binance for crypto; static fallback data is display-only and never executable

## Project Structure

```text
tradepilot-ai-scanner/
  backend/
  frontend/
  python-engine/
  README.md
  .env.example
  package.json
  render.yaml
```

## Clean Fresh-Clone Setup

The project uses **npm everywhere**. Generated folders and local secrets are intentionally ignored by git:

- `node_modules/`
- `dist/`
- `.env` and `.env.*`
- `backend/prisma/dev.db`
- `.DS_Store`

From a fresh clone:

```bash
npm run install:all
npm run prisma:generate
cd backend && npx prisma migrate dev && cd ..
npm run seed
npm run check
npm run build
npm run dev
```

Keep secrets only in `backend/.env`. Commit `.env.example` files, not real credentials.

## Python Analysis Engine

The Node backend remains the main API. The optional Python FastAPI engine adds heavier analysis endpoints:

- `GET /health`
- `POST /analyze/stock`
- `POST /analyze/crypto`
- `POST /analyze/multi-timeframe`
- `POST /backtest/strategy`
- `POST /risk/check`
- `POST /news/score`
- `POST /portfolio/performance`
- `POST /account/equity`
- `POST /trade/review`

Run it locally in a second terminal:

```bash
cd python-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

Or with Docker:

```bash
docker compose -f docker-compose.python.yml up --build
```

Then set:

```bash
PYTHON_ENGINE_ENABLED=true
PYTHON_ENGINE_URL=http://127.0.0.1:8001
PYTHON_ENGINE_TIMEOUT_MS=8000
```

If the Python service is sleeping or unavailable, the backend logs the failure, shows TypeScript fallback in the Automation Center, and continues using the existing deterministic TypeScript analysis. It never enables real-money trading.

## Backend Setup

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

The backend runs at `http://127.0.0.1:8000` by default.

Workers start with the backend by default. Set `RUN_WORKERS_ON_START=false` in `backend/.env` if you want API-only mode.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` by default.

## Environment Variables

Copy the root `.env.example` or backend `.env.example` into `backend/.env`.

```bash
DATABASE_URL="file:./dev.db"
PORT=8000
FRONTEND_URL=http://127.0.0.1:5173
RUN_WORKERS_ON_START=true
AI_PRIMARY_PROVIDER=mistral
OPENAI_API_KEY=
AI_PROVIDER=mistral
AI_FALLBACK_PROVIDER=openai
AI_FALLBACK_ENABLED=true
TECHNICAL_FALLBACK_ENABLED=true
OPENAI_MODEL=gpt-4o-mini
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
LOCAL_MODEL_PROVIDER=none
LOCAL_MODEL_BASE_URL=
LOCAL_MODEL_API_KEY=
LOCAL_MODEL_MODEL=
OLLAMA_ENABLED=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
AI_MAX_CALLS_PER_HOUR=10
AI_MAX_CALLS_PER_DAY=100
AI_CACHE_MINUTES=60
AI_REQUEST_TIMEOUT_SECONDS=30
AI_MAX_RETRIES=2
AI_RETRY_BASE_DELAY_SECONDS=2
AI_MIN_SIGNAL_SCORE=75
AI_DAILY_BUDGET_USD=2
AI_ALLOW_TECHNICAL_ONLY=true
AI_REQUIRE_JSON_RESPONSE=true
APP_OWNER_EMAIL=rayanntchamba@gmail.com
APP_AUTH_SECRET=
APP_AUTH_TOKEN_HOURS=12
APP_ENABLE_PASSCODE_LOGIN=false
RESEND_API_KEY=
APP_EMAIL_FROM="TradePilot AI <onboarding@resend.dev>"
ALPACA_TRADING_ENV=paper
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_API_KEY_ID=
ALPACA_API_SECRET_KEY=
ALPACA_MARKET_DATA_BASE_URL=https://data.alpaca.markets
ALPACA_STOCK_DATA_FEED=iex
PAPER_TRADING_ENABLED=true
ALLOW_LIVE_BROKER_TRADING=false
AUTO_SUBMIT_BROKER_PAPER_ORDERS=false
STOCK_PRICE_REFRESH_MS=5000
STOCK_PRICE_BASE_URL=https://query1.finance.yahoo.com
CRYPTO_PRICE_REFRESH_MS=5000
CRYPTO_PRICE_BASE_URL=https://api.binance.com
NEWS_PROVIDER=finnhub
FINNHUB_API_KEY=
POLYGON_API_KEY=
NEWS_REFRESH_INTERVAL_MINUTES=15
NEWS_MAX_ARTICLES_PER_SCAN=50
NEWS_AI_ANALYSIS_ENABLED=true
NEWS_AI_TOP_N=10
PYTHON_ENGINE_ENABLED=true
PYTHON_ENGINE_URL=http://127.0.0.1:8001
PYTHON_ENGINE_TIMEOUT_MS=8000
```

`APP_OWNER_EMAIL` is the only inbox allowed to receive login codes. `RESEND_API_KEY` sends one-time login codes in production. `APP_AUTH_SECRET` signs short-lived access tokens after login.

External AI is optional. The router tries providers in this order by default:

1. Mistral if `MISTRAL_API_KEY` is configured
2. OpenAI if `OPENAI_API_KEY` is configured
3. Remote OpenAI-compatible model if `LOCAL_MODEL_PROVIDER`, `LOCAL_MODEL_BASE_URL`, and `LOCAL_MODEL_MODEL` are configured
4. Ollama only if `OLLAMA_ENABLED=true`
5. Deterministic technical-only research if all providers are missing or unavailable

On Render, `OLLAMA_ENABLED=false` is the safe default. The app does not require Ollama in production. Technical-only analysis is labeled clearly and is never presented as OpenAI, Mistral, or local-model output.

On Render, the blueprint defines a separate `tradepilot-python-engine` web service and points the Node backend at `https://tradepilot-python-engine.onrender.com`. If Render gives the Python service a different URL, update `PYTHON_ENGINE_URL` in the Node service environment.

The backend reads secrets from `backend/.env`; do not paste secrets into chat or commit them.

## Paper Trading And Safety

- This version is paper trading only.
- Real-money broker execution is disabled.
- Automatic trading is paper trading only.
- The top navigation includes a Stocks/Crypto switch. Crypto mode scans a separate crypto universe and reuses the same research, scoring, watchlist, trade-plan, and paper-trading workflow.
- Stock prices refresh through the backend every 5 seconds using Alpaca Market Data snapshots when paper credentials are configured. The free/default feed is usually `iex`; set `ALPACA_STOCK_DATA_FEED=delayed_sip` or `sip` only if your Alpaca account supports it. Yahoo public quotes are a backup. If every trusted provider is unavailable, the app switches to display-only fallback data and blocks all entries, updates, and exits.
- Crypto prices refresh through the backend every 5 seconds using Binance public market-data tickers. If Binance is unavailable, crypto execution is blocked rather than simulated.
- Trade plans are research-based scenarios, not buy/sell instructions.
- The app avoids guaranteed-profit language.
- Every research report includes bull case, bear case, risks, uncertainty, sources, and a stop-loss plan.
- External AI cannot override deterministic risk controls.
- AI explains and summarizes; deterministic market regime, strategy, checklist, and risk engines make paper-trading decisions.
- Malformed AI responses are rejected and can only trigger fallback or technical-only mode.
- Paper trading can continue when every AI provider is unavailable, but only if deterministic guardrails pass.
- The Settings page shows real trading as disabled: "Coming later - disabled for safety."

## Exchange-Style Paper Terminal

TradePilot now includes a Binance-inspired, original TradePilot-branded terminal. It does not copy Binance branding, logos, colors, or assets. The goal is a serious market-intelligence workspace:

- `/paper-trading/live`: live paper terminal with asset list, professional chart, paper account, risk panel, checklist, open positions, news, and activity feed
- `/portfolio`: paper account value, cash, open position value, realized/unrealized P/L, equity curve, drawdown, open positions, and closed trades
- `/news`: market news/catalyst intelligence with score impact and risk warnings
- asset detail pages: candlestick chart with BUY/SELL markers, stop-loss line, take-profit line, entry line, current line, EMA overlays, volume bars, and data-quality badges

Mobile uses compact cards and a bottom nav for Dashboard, Markets, Live, Portfolio, News, and Settings.

## Paper Account Balance Logic

The default paper account starts at **€500**.

Tracked fields include:

- `startingBalance`
- `cashBalance`
- `availableCash`
- `usedCapital`
- `openPositionsValue`
- `unrealizedPnL`
- `realizedPnL`
- `totalEquity`
- `dailyPnL`
- `weeklyPnL`
- `monthlyPnL`
- `maxDrawdown`

Formula:

```text
totalEquity = cashBalance + openPositionsValue
```

When a paper trade opens, the position cost reduces available cash and creates an open position. When price changes, open position value and unrealized P/L update. When a paper trade closes, the exit value returns to cash and the P/L becomes realized.

Example:

```text
Starting balance: €500
Buy PLTR with €100 -> cash €400, open value €100, total equity €500
PLTR rises to €110 -> cash €400, open value €110, total equity €510
Close at €110 -> cash €510, realized P/L +€10, open value €0
```

The reset endpoint is `POST /api/paper-account/reset`.

## Chart Markers

Every approved paper trade creates a chart marker:

- BUY marker: entry price, strategy name, position size, risk amount, stop-loss, and take-profit context
- SELL marker: exit price, realized P/L, and exit reason

Supported exit reasons include `take_profit_hit`, `stop_loss_hit`, `manual_close`, `critical_news_exit`, `risk_manager_exit`, `time_exit`, `strategy_invalidated`, `trailing_stop`, and `paper_only_auto_exit`.

Chart APIs:

- `GET /api/charts/:assetType/:symbol/candles`
- `GET /api/charts/:assetType/:symbol/markers`
- `GET /api/charts/:assetType/:symbol/position-lines`

## Logos And Profiles

The backend exposes a logo provider abstraction:

- `GET /api/assets/:assetType/:symbol/logo`
- `GET /api/assets/:assetType/:symbol/profile`

Stocks use mapped company-domain logos when available. Crypto uses a local CoinGecko-style fallback map. If a logo is missing, the frontend shows a colored fallback circle with ticker initials.

## News Intelligence

The news engine is provider-based and Render-safe. It supports Finnhub, Polygon, SEC/EDGAR-style fallback, crypto fallback, and RSS/fallback catalyst mode. If provider keys are missing, the app keeps working and clearly labels fallback news.

News extracts:

- ticker/symbol
- sentiment
- impact level
- catalyst type
- time sensitivity
- bullish and bearish interpretation
- risk warning
- score impact
- decision
- confidence

Professional rule: **news must never create a trade alone**. A paper trade still requires technical confirmation, volume confirmation, playbook match, risk/reward, account cash, and risk-engine approval.

## Protected Access

The React app is locked behind an email-code screen. Press **Send access code**, check the configured owner email inbox, then enter the 6-digit code. After a valid code is submitted, the backend returns a signed access token and the frontend attaches it to API requests with an `Authorization` header.

Codes expire after 10 minutes, resend is rate-limited, and passcode login is disabled unless `APP_ENABLE_PASSCODE_LOGIN=true` is explicitly set.

`/api/health`, `/api/auth/code/request`, `/api/auth/code/verify`, `/api/auth/login`, and `/api/auth/session` are the only public API routes. `/api/auth/login` is kept only as an opt-in legacy fallback.

For hosting, set these secrets in your platform dashboard:

```bash
APP_OWNER_EMAIL=rayanntchamba@gmail.com
APP_AUTH_SECRET=generate_a_long_random_secret
APP_AUTH_TOKEN_HOURS=12
APP_ENABLE_PASSCODE_LOGIN=false
RESEND_API_KEY=your_resend_api_key
APP_EMAIL_FROM="TradePilot AI <your_verified_sender@example.com>"
```

The welcome animation after login greets Rayann before loading the dashboard.

## Deployment

The repository includes `render.yaml` for a Render preview deployment:

- `tradepilot-ai-scanner`: one Node/Express web service that serves both `/api` and the built React app
- `tradepilot-ai-scanner-db`: free preview Postgres database
- Render uses npm commands from `render.yaml`: backend `npm ci`, Prisma Postgres generate/build, frontend `npm ci`, frontend build, then backend start.

Render setup:

1. Push this project to GitHub.
2. In Render, create a new Blueprint from the repository.
3. Set secret env vars: `RESEND_API_KEY`, `APP_EMAIL_FROM`, `OPENAI_API_KEY` if used, `ALPACA_API_KEY_ID`, and `ALPACA_API_SECRET_KEY`.
4. Set `MISTRAL_API_KEY` if you want fallback AI after OpenAI failures. Optional remote model providers can be configured with `LOCAL_MODEL_BASE_URL`, `LOCAL_MODEL_API_KEY`, and `LOCAL_MODEL_MODEL`.
5. Keep `ALLOW_LIVE_BROKER_TRADING=false`.
6. After Render finishes, open the web-service URL Render gives you, for example `https://tradepilot-ai-scanner.onrender.com`.

The deployed frontend uses same-origin `/api`, so it does not need a separate `VITE_API_BASE_URL` when served by the backend. The backend deployment uses `backend/prisma/schema.postgres.prisma`; the local app keeps using `backend/prisma/schema.prisma` with SQLite. Free preview hosting is useful for testing, but long-running autonomous workers are more reliable on an always-on paid service.

Render worker modes:

- Single-service MVP: set `RUN_WORKERS_ON_START=true` or leave it unset. The web service serves the app and runs cron workers.
- Separate background worker later: set `RUN_WORKERS_ON_START=false` on the web service, create a Render background worker with the same database/env vars, and run the backend start command there. Use only one worker mode at a time.

## Broker Integration

The first real broker connector is Alpaca Trading API.

Default mode:

- `ALPACA_TRADING_ENV=paper`
- `ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets/v2`
- Orders go to Alpaca paper trading only.
- Live real-money broker orders are blocked and logged as risk events.
- Broker credentials stay in `backend/.env`; do not put them in frontend code.

To enable Alpaca paper trading:

```bash
ALPACA_TRADING_ENV=paper
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_AUTH_MODE=api_key
ALPACA_API_KEY_ID=your_paper_key_id
ALPACA_API_SECRET_KEY=your_paper_secret
ALPACA_AUTH_BASE_URL=https://authx.sandbox.alpaca.markets/v1
ALPACA_OAUTH_CLIENT_ID=
ALPACA_OAUTH_CLIENT_SECRET=
ALLOW_LIVE_BROKER_TRADING=false
AUTO_SUBMIT_BROKER_PAPER_ORDERS=false
```

Restart the backend, then open Broker Center and click Sync Account. Eligible trade plans can be submitted manually to Alpaca paper trading. If `AUTO_SUBMIT_BROKER_PAPER_ORDERS=true`, autonomous paper trades can also submit to Alpaca paper trading after the internal risk engine approves them.

Alternative AuthX OAuth client-credentials mode:

```bash
ALPACA_AUTH_MODE=oauth_client_credentials
ALPACA_AUTH_BASE_URL=https://authx.sandbox.alpaca.markets/v1
ALPACA_OAUTH_CLIENT_ID=your_authx_client_id
ALPACA_OAUTH_CLIENT_SECRET=your_authx_client_secret
```

The app requests a bearer token from `/oauth2/token` with `grant_type=client_credentials`, caches it in backend memory until expiry, and never sends the token to the frontend.

Live broker integration is intentionally not enabled from the UI. Future live trading would require a separate compliance checklist, explicit user approvals, server-side unlocks, complete audit logs, broker disclosures, and manual confirmation per order.

## Live-Data Execution Safeguards

Automated paper execution now fails closed:

- Stock execution requires a fresh Alpaca or Yahoo Finance quote during the regular US equity session. Weekends and major US exchange holidays are blocked.
- Crypto execution requires a fresh Binance quote.
- Static reference data remains available for display, but it can never open, update, or close an automated position.
- Charts and multi-timeframe analysis use provider OHLCV candles for each requested timeframe; synthetic candles are not generated.
- AI `reject` decisions stop execution.
- A ticker can open at most once per trading session and enters a 24-hour cooldown after a stop-loss by default.
- Prediction outcomes are calculated only after real 1-day, 7-day, and 30-day market candles become available.
- Account and position records are reconciled after every execution cycle.

Relevant environment controls:

```bash
STOCK_EXECUTION_QUOTE_MAX_AGE_MINUTES=20
CRYPTO_EXECUTION_QUOTE_MAX_AGE_MINUTES=3
STOP_LOSS_REENTRY_COOLDOWN_HOURS=24
MAX_ENTRY_PRICE_DRIFT_PERCENT=1
```

If all live providers fail, the application continues in research/display mode and records blocked risk events instead of fabricating prices.

## Automation

The MVP uses `node-cron` instead of Redis/BullMQ so it can run locally without extra services. Scheduled jobs:

- `marketScanJob`: scans the configured live stock and crypto providers every 15 minutes in development
- `newsScanJob`: reviews catalysts for top candidates
- `aiResearchJob`: researches the top 10 candidates and saves structured reports
- `paperTradeUpdateJob`: updates paper trades from fresh live quotes, blocks stock execution outside regular US market sessions, applies re-entry cooldowns, and closes stop-loss/take-profit hits at the observed market price
- `riskCheckJob`: checks paper trades and creates risk warnings
- `dailyReviewJob`: reviews prediction outcomes and strategy performance
- `weeklyLearningJob`: calculates longer-horizon learning from verified historical candles and stored closed paper trades

Run jobs manually from the Automation Center or call:

```bash
curl -X POST http://127.0.0.1:8000/api/automation/jobs/marketScanJob/run \
  -H "Authorization: Bearer your_access_token"
```

## Agent System

The backend records structured JSON runs for:

- `marketScannerAgent`
- `newsAgent`
- `fundamentalAgent`
- `technicalAgent`
- `riskAgent`
- `decisionAgent`
- `paperTradingAgent`
- `learningAgent`

If `OPENAI_API_KEY` is configured, research reports can use OpenAI through the AI router. If OpenAI fails with timeout, quota, billing, malformed JSON, outage, or transient network errors, the router tries Mistral when `MISTRAL_API_KEY` is configured. It can then try a remote OpenAI-compatible provider and optional Ollama when configured. If all providers fail or keys are missing, the system records a technical-only analysis from deterministic scanner data.

The router stores provider, model, recommendation, confidence, reasoning, risks, source quality, fallback status, estimated cost, and sanitized error codes. It caches recent analyses, enforces hourly/daily call limits, enforces a daily AI budget, and marks unhealthy providers on cooldown.

AI modes shown in the UI and API:

- `AI_ENHANCED`
- `REMOTE_LOCAL_MODEL`
- `OLLAMA_LOCAL`
- `TECHNICAL_ONLY`
- `CACHED_RESEARCH`

## Professional Decision Engine

TradePilot can operate without OpenAI or any external AI provider. The deterministic engine evaluates:

- Daily briefing / pre-market preparation
- Market regime and sector/crypto context
- Catalyst confirmation
- Multi-timeframe alignment
- Professional playbook match
- Execution quality and chase risk
- Advanced risk state
- Technical setup, liquidity, volatility, and risk/reward
- Stock fundamentals and valuation inputs
- Strategy gate status: `NEW`, `TESTING`, `PROVEN`, `WEAK`, or `DISABLED`
- Research quality: `HIGH QUALITY`, `MEDIUM QUALITY`, `LIMITED`, or `LOW QUALITY`
- No-trade reasons and hard risk filters

Allowed professional decisions:

- `NO_TRADE`
- `AVOID`
- `WEAK_WATCH`
- `WATCH`
- `STRONG_WATCH`
- `PAPER_TRADE_CANDIDATE`
- `BLOCKED_BY_RISK`

No trade is a valid professional decision. Strategies must prove themselves through backtesting and paper trading before any future real-money use. Real trading remains disabled.

## 5-Year Trader Discipline Layer

The app now adds a process layer modeled on experienced-trader discipline, without claiming real-money trading skill:

- Daily Market Briefing for stocks and crypto
- Multi-timeframe analysis for stocks: 5m, 15m, 1h, daily
- Multi-timeframe analysis for crypto: 15m, 1h, 4h, daily
- Professional playbook library for stock and crypto strategies
- 5-year trader checklist before paper trade approval
- No-Trade Mode 2.0 with rejected-candidate explanations
- Execution quality scoring: `A+`, `A`, `B`, `C`, `D`, `F`
- Advanced risk states: `NORMAL`, `CAUTION`, `REDUCED_SIZE`, `PAUSED`, `LOCKED`
- Paper process benchmark: Not enough data, beginner, 1-year, 3-year, or 5-year process level
- Weekly trader report card

Automatic paper trades are blocked if a hard rule fails. This includes conflicting timeframes, weak/disabled strategy, low research quality, weak risk/reward, missing stop-loss, unacceptable execution grade, paused risk state, or active no-trade conditions.

## Documented Reports

The Reports Center creates documented research reports for scanned opportunities. Each report includes:

- Executive summary
- Educational guidance stance
- Market-data, technical, fundamental, bull/bear, risk, and learning-engine studies
- Evidence table
- Paper-trading risk controls
- Markdown export

These reports are educational decision support for paper trading. They are not personalized financial advice.

## Automatic Paper Trading

The paper-trading bot can open simulated trades only when all guardrails pass:

- Trend Breakout V2 deterministic score is at least 85/100
- Every mandatory market-regime, trend, breakout, volume, relative-strength, volatility, and intraday rule passes
- Live price remains inside the ATR-based valid entry zone
- Risk level is not High and the refreshed structure stop fits the original maximum-loss budget
- Max open trades, daily trade count, sector exposure, loss streak, weekly loss, and account drawdown limits are not breached
- Stop-loss exists and initial risk/reward is 2.5:1
- Duplicate signals and rapid stop-loss re-entry are blocked
- Strategy is `TESTING` or `PROVEN`; `NEW`, `WEAK`, and `DISABLED` strategies cannot auto-paper-trade
- Automatic crypto paper trading and all real-money trading remain disabled

## AI Status API

- `GET /api/ai/status`: provider mode, health, usage, budget, cache hit rate, heartbeat, and recent analysis summaries
- `GET /api/ai/analyses`: recent sanitized AI/technical analyses

These endpoints never return API keys, authorization headers, broker credentials, or raw provider responses.

## Diagnostics APIs

- `GET /api/health`: public health check with paper-only mode
- `GET /api/system/status`: database, AI mode, worker status, latest scans, latest research, technical engine, and real-trading-disabled status
- `GET /api/market-data/status`: stock and crypto provider/source status
- `GET /api/jobs/status`: scheduled automation job status
- `GET /api/research/status`: research counts, quality breakdown, and AI mode breakdown
- `GET /api/briefing/daily`: stock and crypto daily briefing
- `GET /api/briefing/stocks`: stock briefing
- `GET /api/briefing/crypto`: crypto briefing
- `GET /api/no-trade/status`: no-trade mode and rejected candidates
- `GET /api/risk/status`: advanced risk state
- `GET /api/playbooks/status`: strategy playbooks and proof levels
- `GET /api/benchmark/status`: beginner-to-5-year process benchmark
- `GET /api/reports/weekly`: weekly trader report card

Diagnostics do not expose secrets.

## Learning Engine

The learning engine compares stored predictions with verified historical market outcomes and tracks:

- 1-day, 7-day, and 30-day returns
- Win rate
- Average gain and loss
- Profit factor
- Max drawdown
- Best and worst signal types
- Best and worst sectors
- Latest learning insights

## Stock And Crypto Separation

The app now treats stocks and crypto as separate paper-trading sections:

- Main overview: `/`
- Stock routes: `/stocks`, `/stocks/scanner`, `/stocks/:ticker`, `/stocks/paper-trading`, `/stocks/watchlist`, `/stocks/learning`, `/stocks/alerts`, `/stocks/reports`
- Crypto routes: `/crypto`, `/crypto/scanner`, `/crypto/:symbol`, `/crypto/paper-trading`, `/crypto/watchlist`, `/crypto/learning`, `/crypto/alerts`, `/crypto/reports`
- Shared system routes: `/automation`, `/agents`, `/broker`, `/settings`

Shared database records include `assetType: "stock" | "crypto"` where relevant, and real trading remains disabled for both sections. Crypto is paper-only with no leverage, futures, margin, withdrawals, or live broker execution.

## API Overview

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/stocks/dashboard`
- `POST /api/stocks/scanner/run`
- `GET /api/stocks/scanner/latest`
- `GET /api/stocks/signals`
- `GET /api/stocks/:ticker`
- `GET /api/stocks/:ticker/chart`
- `POST /api/stocks/:ticker/research`
- `POST /api/stocks/trade-plans`
- `GET /api/stocks/paper-trades`
- `POST /api/stocks/paper-trades`
- `GET /api/crypto/dashboard`
- `POST /api/crypto/scanner/run`
- `GET /api/crypto/scanner/latest`
- `GET /api/crypto/signals`
- `GET /api/crypto/:symbol`
- `GET /api/crypto/:symbol/chart`
- `POST /api/crypto/:symbol/research`
- `POST /api/crypto/trade-plans`
- `GET /api/crypto/paper-trades`
- `POST /api/crypto/paper-trades`
- `POST /api/scanner/run`
- `GET /api/scanner/latest`
- `GET /api/scanner/signals`
- `GET /api/stocks/:ticker`
- `GET /api/stocks/:ticker/chart`
- `POST /api/stocks/:ticker/research`
- `GET /api/research/:ticker`
- `POST /api/research/:ticker/generate`
- `GET /api/reports/investment/:ticker`
- `GET /api/reports/investment/:ticker/markdown`
- `POST /api/trade-plans`
- `GET /api/trade-plans/:ticker`
- `GET /api/trade-plans`
- `POST /api/paper-trades`
- `GET /api/paper-trades`
- `PUT /api/paper-trades/:id/close`
- `PUT /api/paper-trades/:id/update-price`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/:ticker`
- `GET /api/journal`
- `POST /api/journal`
- `POST /api/journal/:id/ai-review`
- `GET /api/alerts`
- `POST /api/alerts`
- `DELETE /api/alerts/:id`
- `GET /api/automation/status`
- `GET /api/system/status`
- `GET /api/market-data/status`
- `GET /api/jobs/status`
- `GET /api/research/status`
- `GET /api/briefing/daily`
- `GET /api/briefing/stocks`
- `GET /api/briefing/crypto`
- `GET /api/no-trade/status`
- `GET /api/risk/status`
- `GET /api/playbooks/status`
- `GET /api/benchmark/status`
- `GET /api/reports/weekly`
- `GET /api/timeframes/:ticker`
- `GET /api/ai/status`
- `GET /api/ai/analyses`
- `POST /api/automation/jobs/:name/run`
- `PUT /api/automation/auto-paper-trading`
- `GET /api/agents/runs`
- `GET /api/learning/summary`
- `GET /api/strategy/performance`
- `GET /api/broker/status`
- `POST /api/broker/sync`
- `GET /api/broker/orders`
- `POST /api/broker/orders/from-trade-plan`

## Future Roadmap

- V1: Market scanner + AI research + paper trading
- V2: Real market data provider
- V3: Alerts and notifications
- V4: Backtesting engine
- V5: Multi-agent research system
- V6: Portfolio risk engine
- V7: Broker connection with manual approval only, strict user confirmation, and real-money trading disabled by default
- V8: Advanced automation with strict user-defined rules

## Root Convenience Commands

```bash
npm run install:all
npm run prisma:generate
npm run seed
npm run check
npm run build
npm run dev
```

`npm run dev` starts the backend and frontend for local development. Use `RUN_WORKERS_ON_START=false` in `backend/.env` when you want API-only local mode without scheduled automation workers.
