# TradePilot LEAN Edition

TradePilot remains the React/TypeScript product, research, authentication, safety, reporting, and mobile dashboard. The trading engine is now **QuantConnect LEAN**, running the same event-driven C# algorithm for historical backtests and Alpaca paper execution.

## Architecture

```text
React dashboard
      ↓
Node.js / Express / TypeScript API
      ↓ authenticated HTTP
TradePilot LEAN Gateway (Node.js, always on)
      ↓ Docker jobs
Official QuantConnect LEAN engine + TradePilotLeanAlgorithm.dll
      ↓
Historical data for backtests / Alpaca paper brokerage for paper execution
```

### Responsibility split

| Component | Responsibility |
|---|---|
| React frontend | LEAN jobs, dashboard, research, risk visibility, emergency controls |
| TypeScript API | Users, AI/news research, audit records, configuration, gateway adapter |
| LEAN gateway | Authenticated job lifecycle, Docker isolation, paper-only enforcement |
| LEAN engine | Market events, portfolio accounting, orders, fills, fees, brokerage models, calendars, corporate actions, results |
| C# algorithm | Trend Breakout V2 signal, sizing, portfolio circuit breakers, protective orders and exits |

The old Python service is removed. `TRADING_ENGINE=lean` also prevents the legacy TypeScript automation worker from opening new positions, so LEAN is the single automated execution authority. Legacy simulator positions can still be monitored and closed.

## What “full LEAN” means here

The repository does not paste or fork thousands of upstream LEAN source files. It builds on the **complete official `quantconnect/lean` Docker image**, then adds the TradePilot C# algorithm assembly. This provides the full engine while preserving upstream attribution, security updates, and Apache-2.0 licensing.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Safety

This edition is intentionally paper-only:

- `ALLOW_LIVE_BROKER_TRADING=false` is checked by both the TradePilot API and LEAN gateway.
- The paper template fixes `alpaca-environment` to `paper`.
- The gateway refuses to start execution when the live-money flag is enabled.
- A minimum-length gateway token is required when Docker execution is enabled.
- Only one LEAN paper session may be active.
- The legacy direct broker adapter is blocked when `TRADING_ENGINE=lean`.

These controls reduce configuration mistakes, but they are not a guarantee of profitability or operational safety.

## Strategy included

`lean-engine/TradePilot.Algorithm/TradePilotLeanAlgorithm.cs` provides:

- Configurable long-only watchlist of liquid US equities
- SPY benchmark regime filter
- EMA20 / EMA50 / SMA200 trend alignment
- 20-day breakout confirmation
- Relative-volume confirmation
- 60-day relative strength versus SPY
- ATR and RSI filters
- Volatility-adjusted position sizing
- Maximum three concurrent positions by default
- 1% portfolio risk per trade by default
- Daily-loss and peak-drawdown circuit breakers
- Broker-side stop-market and limit target orders
- Partial-entry fill accounting
- Sibling-order and outstanding-entry cancellation during exits
- Explicit closing state and protection recovery after rejected/cancelled exits
- Breakeven and trailing-stop management
- EMA20 and maximum-holding-period exits

All values can be changed through LEAN job parameters without maintaining separate backtest and paper implementations.

## Requirements

- Node.js 22
- Docker Engine
- A machine that stays online for paper trading
- PostgreSQL for production TradePilot data
- Alpaca **paper** API credentials for paper execution
- QuantConnect user/API/organization credentials and any required local brokerage-module entitlement for the official Alpaca plug-in
- LEAN-compatible historical US-equity data for local backtests

The LEAN gateway should run directly on the Docker host. This avoids Docker-socket bind-path problems that occur when a container tries to launch sibling containers with host file mounts.

## Installation

```bash
cp .env.example .env
cp lean-gateway/.env.example lean-gateway/.env
npm run install:all
```

Generate a long random shared token and put the same value in:

```env
# backend/root .env
LEAN_ENGINE_TOKEN=your-long-secret
LEAN_ENGINE_URL=http://127.0.0.1:8090

# lean-gateway/.env
LEAN_GATEWAY_TOKEN=your-long-secret
```

Build the TradePilot LEAN image:

```bash
npm run build:lean-engine
```

This pulls the full official LEAN image and compiles `TradePilotLeanAlgorithm.dll` into it.

## Historical data

Place LEAN-compatible data under:

```text
lean-gateway/runtime/data/
```

The gateway mounts that directory into `/Lean/Data` as read-only. Backtests fail closed when required market, map, factor, or security-master data is missing. Market datasets are not bundled with this project.

## Start locally

Terminal 1 — backend:

```bash
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm run dev
```

Terminal 3 — LEAN gateway:

```bash
cd lean-gateway
npm start
```

Open the dashboard and select **LEAN Engine**.

The gateway defaults to dry-run mode:

```env
LEAN_EXECUTION_ENABLED=false
```

A backtest request will validate and record a completed dry-run job without starting Docker. Generated credential-bearing configuration files are deleted immediately after validation. After the engine image and data are ready, change it to:

```env
LEAN_EXECUTION_ENABLED=true
```

For Alpaca paper execution, also set in `lean-gateway/.env`:

```env
ALPACA_API_KEY_ID=
ALPACA_API_SECRET_KEY=
QUANTCONNECT_USER_ID=
QUANTCONNECT_API_TOKEN=
QUANTCONNECT_ORGANIZATION_ID=
ALLOW_LIVE_BROKER_TRADING=false
```

## Production deployment

### Recommended

Use an always-on Docker VPS for:

- LEAN gateway
- LEAN job containers
- Historical data storage
- Alpaca paper session

Use Render or the same VPS for the React frontend, TypeScript API, and PostgreSQL.

The API needs:

```env
TRADING_ENGINE=lean
LEAN_ENGINE_URL=https://your-private-lean-gateway.example
LEAN_ENGINE_TOKEN=the-shared-secret
ALLOW_LIVE_BROKER_TRADING=false
```

Protect the gateway with a firewall, TLS reverse proxy, IP allow-list, and its bearer token. Do not expose the Docker socket or the gateway directly to the public internet.

A systemd template is provided at:

```text
deploy/tradepilot-lean-gateway.service
```

## Validation

```bash
# Backend tests
cd backend && npm test

# Backend type-check (requires successful Prisma client generation)
cd backend && npm run prisma:generate && npm run check

# Frontend
cd frontend && npm run check && npm run build

# Gateway syntax
cd lean-gateway && npm run check

# C# algorithm and complete engine image
npm run build:lean-engine
```

## Important limitations

- A strategy using LEAN is not automatically profitable.
- Local LEAN backtests require properly licensed, point-in-time historical data.
- Backtest and paper results should be tested for survivorship bias, look-ahead bias, parameter overfitting, transaction costs, regime sensitivity, and out-of-sample stability.
- The custom C# algorithm was prepared for compilation in the official image; this package must be built and smoke-tested on a Docker host before enabling execution.
- The official local Alpaca brokerage plug-in may require a paid QuantConnect organization/module entitlement; verify your account before planning paper deployment.
- Keep the bot in paper and shadow testing until the strategy has substantial forward evidence.
