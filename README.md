# TradePilot Professional v4

> **Professional architecture:** this repository now contains the v4 multi-user trading/investment core while preserving the existing LEAN scanner/research experience. Read [PROFESSIONAL_V4.md](./PROFESSIONAL_V4.md), [IMPLEMENTATION_MATRIX.md](./IMPLEMENTATION_MATRIX.md), and [MIGRATION_V4.md](./MIGRATION_V4.md) first.

## Architecture

```text
React web terminal
      ↓ HTTPS / ticketed WebSocket
Node.js / Express Professional API
      ↓
Identity · Portfolio · Ledger · OMS · Risk · Broker adapters
      ↓                    ↓
PostgreSQL + Redis       Alpaca (per-user account)
      ↓
LEAN job queue + reconciliation + automation workers
      ↓
Private LEAN gateway pool
      ↓
Official QuantConnect LEAN containers
```

### Responsibility split

| Component | Responsibility |
|---|---|
| React frontend | Professional control plane, order ticket, portfolios, LEAN jobs, research, risk and analytics |
| TypeScript API | Identity/MFA/sessions, portfolio accounting, OMS, risk, broker abstraction, market data, research and audit |
| Workers | LEAN dispatch, broker/order reconciliation and legacy scanner automation without duplicating cron jobs across API replicas |
| LEAN gateway | Authenticated multi-job Docker lifecycle, isolation and paper-only enforcement |
| LEAN engine | Strategy market events, brokerage simulation/paper execution, fills, calendars, corporate actions and results |
| C# algorithm | Trend Breakout V2 signal, sizing, portfolio circuit breakers, protective orders and exits |

The old Python service is removed. Manual v4 orders use the OMS directly and do not launch LEAN. Algorithmic/backtest/paper strategy jobs use the LEAN worker/gateway path. Legacy environment-level broker execution is retained only for operator compatibility and is blocked for normal users.

## What “full LEAN” means here

The repository does not paste or fork thousands of upstream LEAN source files. It builds on the **complete official `quantconnect/lean` Docker image**, then adds the TradePilot C# algorithm assembly. This provides the full engine while preserving upstream attribution, security updates, and Apache-2.0 licensing.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Safety

LEAN strategy execution remains intentionally paper-only. The canonical manual OMS has a separate fail-closed live path:

- `ALLOW_LIVE_BROKER_CONNECTIONS=false` blocks creating live broker connections by default.
- `ALLOW_LIVE_BROKER_TRADING=false` blocks live order execution by default.
- Enabling a live account also requires user MFA and explicit per-account permission.
- The LEAN paper template fixes `alpaca-environment` to `paper` and the gateway refuses live-money LEAN execution.
- A minimum-length gateway token is required when Docker execution is enabled.
- Multiple isolated LEAN jobs are allowed only up to `LEAN_MAX_CONCURRENT_JOBS`.
- Legacy environment-level broker endpoints are operator-only.

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

Terminal 4 — LEAN queue worker:

```bash
npm run dev:lean-worker
```

Terminal 5 — broker/order reconciliation worker:

```bash
npm run dev:reconcile-worker
```

For local legacy scanner scheduling, either leave `RUN_WORKERS_ON_START=true` on the single API process or run `npm run dev:automation-worker` with `RUN_WORKERS_ON_START=false`. In production, always use the dedicated automation worker.

Open the dashboard and select **Platform** for the v4 multi-user control plane; the existing LEAN views remain available for engine operations.

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

The included `deploy/docker-compose.pro.yml` separates the web/API process from the LEAN, reconciliation and automation workers and provisions PostgreSQL + Redis. `render.yaml` follows the same process separation.

Recommended production roles:

- React frontend/reverse proxy
- 2+ stateless TypeScript API replicas with `RUN_WORKERS_ON_START=false`
- managed PostgreSQL
- managed Redis
- one or more LEAN queue workers
- one reconciliation worker (scale carefully; reconciliation is account-oriented)
- one legacy automation worker
- private LEAN gateway hosts + isolated LEAN containers

The API and workers must share the same production data-encryption key version. A minimum baseline is:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
APP_AUTH_SECRET=...
APP_DATA_ENCRYPTION_KEY=...
APP_DATA_ENCRYPTION_KEY_VERSION=v1
RUN_WORKERS_ON_START=false
LEAN_ENGINE_URL=https://your-private-lean-gateway.example
LEAN_ENGINE_TOKEN=the-shared-secret
ALLOW_LIVE_BROKER_CONNECTIONS=false
ALLOW_LIVE_BROKER_TRADING=false
```

Protect LEAN gateways with a private network/firewall, TLS, allow-listing and the bearer token. Do not expose the Docker socket or a gateway directly to the public internet. Apply `deploy/postgres-ledger-immutability.sql` after schema deployment. See `deploy/PRODUCTION_CHECKLIST.md` and `deploy/ENVIRONMENTS.md` before a live pilot.

A systemd template for a LEAN gateway host remains available at:

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
