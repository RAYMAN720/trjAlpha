# TradePilot LEAN Gateway

Authenticated, paper-only job controller for isolated QuantConnect LEAN Docker containers.

## Responsibilities

- Creates one private LEAN configuration per job with file mode `0600`.
- Keeps Alpaca and QuantConnect credentials out of the persisted job index.
- Runs historical backtests with networking disabled.
- Limits every container by memory, CPU and process count.
- Allows only one active Alpaca paper session.
- Watches containers, captures logs/results and reconciles active jobs after a gateway restart.
- Deletes generated credential-bearing configuration files after completion, failure, stop or dry-run validation.
- Refuses to start when live-money trading is enabled.

## Start safely

```bash
cp .env.example .env
npm start
```

Keep `LEAN_EXECUTION_ENABLED=false` initially. In this mode, job requests are validated and recorded as completed dry runs, but Docker is not started.

Before enabling execution:

1. Build `tradepilot-lean-engine:latest`.
2. Mount valid point-in-time LEAN data under `runtime/data`.
3. Configure a bearer token of at least 24 characters.
4. Add Alpaca **paper** credentials.
5. Add the QuantConnect user, API token and organization ID required by the official local Alpaca brokerage module.
6. Confirm your QuantConnect organization has the necessary local brokerage/module entitlement.
7. Run a historical backtest before starting a paper session.

Then set:

```env
LEAN_EXECUTION_ENABLED=true
ALLOW_LIVE_BROKER_TRADING=false
```

## Endpoints

- `GET /health` — process, Docker and paper-only status.
- `GET /jobs` — authenticated job list.
- `GET /jobs/:id` — authenticated job details.
- `POST /jobs/backtest` — validate or start a LEAN backtest.
- `POST /jobs/paper` — validate or start one Alpaca paper engine.
- `POST /jobs/:id/stop` — stop an active container and finalize its job record.

## Host requirements

Use an always-on Linux Docker host or VPS. The gateway needs access to the Docker daemon and should not be exposed directly to the public internet. Put it behind a firewall/private network and let the TradePilot TypeScript API call it with `LEAN_GATEWAY_TOKEN`.
