# Environment isolation

Professional v4 uses five conceptual environments. Do not point them at the same database or broker account.

| Environment | Purpose | Database | Broker | Live trading |
|---|---|---|---|---|
| LOCAL | Developer workstation | Local SQLite/PostgreSQL | Paper only | Off |
| DEV | Shared development | Dedicated dev PostgreSQL | Paper/sandbox | Off |
| STAGING | Release validation/load tests | Dedicated staging PostgreSQL | Paper/sandbox | Off |
| PAPER | User-facing paper product | Dedicated production-grade PostgreSQL | Paper | Off |
| PRODUCTION | Approved real-money service | Dedicated production PostgreSQL | Live broker accounts | Fail-closed; explicit enable only |

## Hard rules

- Use different database credentials and encryption keys between non-production and production.
- Never copy live broker credentials into development.
- API replicas run with `RUN_WORKERS_ON_START=false`; scheduled automation runs in its dedicated worker.
- Connecting a live broker requires `ALLOW_LIVE_BROKER_CONNECTIONS=true`.
- Executing against a live broker additionally requires `ALLOW_LIVE_BROKER_TRADING=true`, MFA on the user, explicit account permission and the exact enable confirmation.
- LEAN gateway remains paper/backtest oriented in this release; manual live orders do not route through LEAN.
