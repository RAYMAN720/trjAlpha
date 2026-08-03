# TradePilot Professional v4 — LEAN Gateway

Authenticated, paper-only job controller for isolated QuantConnect LEAN Docker containers.

## Responsibilities

- Creates one private LEAN configuration per job with file mode `0600`.
- Accepts short-lived per-job paper-broker credentials from the trusted TradePilot worker and never persists them in job request metadata.
- Keeps Alpaca and QuantConnect credentials out of the persisted job index.
- Runs historical backtests with networking disabled.
- Limits every container by memory, CPU and process count.
- Supports multiple independent LEAN jobs up to `LEAN_MAX_CONCURRENT_JOBS` instead of one global session.
- Watches containers, captures logs/results and reconciles active jobs after a gateway restart.
- Deletes generated credential-bearing configuration files after completion, failure, stop or dry-run validation.
- Refuses live-money LEAN execution; the v4 manual live OMS is a separate explicitly gated path.

## Start safely

```bash
cp .env.example .env
npm start
```

Keep `LEAN_EXECUTION_ENABLED=false` initially. In this mode, job requests are validated and recorded as completed dry runs, but Docker is not started.

Before enabling paper execution:

1. Build `tradepilot-lean-engine:latest`.
2. Mount valid point-in-time LEAN data under `runtime/data`.
3. Configure a bearer token of at least 24 characters.
4. Configure QuantConnect local-engine credentials/entitlements if required by the brokerage module.
5. Keep `ALLOW_LIVE_BROKER_TRADING=false`.
6. Run historical backtests before starting paper sessions.

Then set:

```env
LEAN_EXECUTION_ENABLED=true
LEAN_MAX_CONCURRENT_JOBS=8
ALLOW_LIVE_BROKER_TRADING=false
```

The Professional API's `leanWorker` supplies the user-owned paper broker credential when a PAPER job is dispatched. Environment-level Alpaca credentials remain a compatibility fallback for operator-controlled deployments only.

## Endpoints

- `GET /health` — process, Docker, concurrency and paper-only status.
- `GET /jobs` — authenticated job list.
- `GET /jobs/:id` — authenticated job details.
- `POST /jobs/backtest` — validate or start a LEAN backtest.
- `POST /jobs/paper` — validate or start an independent Alpaca paper engine.
- `POST /jobs/:id/stop` — stop an active container and finalize its job record.

## Host requirements

Use an always-on Linux Docker host or private compute pool. The gateway needs access to the Docker daemon and should not be exposed directly to the public internet. Put it behind a firewall/private network and let the TradePilot worker call it with `LEAN_GATEWAY_TOKEN`.
