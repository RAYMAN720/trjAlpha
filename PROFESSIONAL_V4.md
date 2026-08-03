# TradePilot Professional v4

This repository is the production-oriented evolution of the original TradePilot LEAN Edition. It preserves the scanner, research, paper-trading, AI and professional desk features while introducing a canonical multi-user trading/investment core under `/api/v4`.

## What changed

### 1. Multi-user identity and tenant isolation
- Email OTP works for arbitrary user email addresses instead of a hard-coded owner.
- Login challenges and sessions are persisted in PostgreSQL/Prisma so multiple API replicas can validate the same session state.
- Sessions can be revoked and are tied to a user, IP metadata and user agent.
- Optional TOTP authenticator MFA is supported.
- Watchlists, journal entries and alerts are user-owned.
- Every v4 portfolio, broker account, order, strategy, notification and LEAN job carries explicit user ownership.

### 2. Professional portfolio/accounting core
Canonical v4 models use `Decimal` for money/quantities:
- `Portfolio`
- `CashBalance`
- `Position`
- `Order`
- `OrderFill`
- `LedgerEntry`
- `PerformanceSnapshot`
- `RiskSnapshot`

The legacy paper simulator models remain temporarily for compatibility. New financial workflows should use the v4 models.

### 3. OMS and risk gateway
Normal user orders do not run through LEAN. `/api/v4/orders` executes this flow:

`API -> tenant check -> idempotency -> pre-trade risk -> Order record -> BrokerAdapter -> broker`

Order lifecycle states include created, risk-approved, submitted, accepted, partially filled, filled, cancelled, rejected, expired and error states. Broker synchronization records fills and immutable ledger entries.

### 4. Broker abstraction and encrypted credentials
`BrokerAdapter` is the interface used by the OMS. Alpaca is the first adapter. Per-user API credentials are AES-256-GCM encrypted at rest with `APP_DATA_ENCRYPTION_KEY`; secrets are never returned by API responses.

Live execution is fail-closed. Connecting a live account first requires `ALLOW_LIVE_BROKER_CONNECTIONS=true`. Actual execution additionally requires `ALLOW_LIVE_BROKER_TRADING=true`, TOTP MFA on the user, an explicit per-account live permission and the exact live-enable confirmation. Connecting a live account never grants execution by itself.

Paper remains the default.

### 5. Reconciliation
`POST /api/v4/brokers/:id/reconcile` compares local positions, cash and open broker orders with TradePilot state, refreshes authoritative broker balances, records compensating ledger entries, surfaces unknown broker orders and stores mismatches in `ReconciliationIssue`. A dedicated reconciliation worker also synchronizes active OMS order fills/statuses.

### 6. LEAN worker pool
The API stores `LeanJobRecord` rows in PostgreSQL. `npm run worker:lean --prefix backend` runs an independently scalable worker that claims queued jobs and dispatches them to the LEAN gateway.

The gateway now supports multiple simultaneous LEAN jobs up to `LEAN_MAX_CONCURRENT_JOBS`. User-specific paper credentials can be passed internally to a job without being stored in gateway job metadata.

Scale by running multiple worker processes and, when required, multiple LEAN gateway hosts behind an internal scheduler/load balancer.

### 7. Redis and real-time events
`REDIS_URL` is optional locally and recommended in production. The built-in Redis client is dependency-free and is currently used for distributed rate-limit counters, quote cache support and event publication.

The API also exposes a WebSocket endpoint at `/ws`. Authenticated clients first request a 60-second ticket from `POST /api/v4/realtime/ticket`. Order events are pushed in real time. Each API replica uses Redis pub/sub as a cross-instance backplane, so events produced by another API node or worker can reach the replica holding the user's socket.

### 8. Normalized market data
`/api/v4/quote/:symbol` goes through `normalizedMarketDataService`, which gives downstream trading code one quote format rather than provider-specific shapes and writes a short-lived Redis/database cache.

### 9. Versioned strategies
`Strategy -> StrategyVersion -> StrategyDeployment` prevents production algorithms from silently changing when source/parameters change. Every version has a code hash and immutable version number.

### 10. Audit and observability
Critical actions are stored in `AuditEvent`. The runtime adds structured security headers, request IDs, rate limiting, health information and Prometheus-style counters under the v4 operations API. JSON structured logger helpers are included for deployment integration with Datadog/Grafana/Loki/OpenTelemetry collectors.

## New API surface

- `GET /api/v4/capabilities`
- `GET /api/v4/me`
- `POST /api/v4/realtime/ticket`
- `POST /api/v4/security/mfa/setup`
- `POST /api/v4/security/mfa/enable`
- `POST /api/v4/security/mfa/disable`
- `GET /api/v4/security/sessions`
- `DELETE /api/v4/security/sessions/:id`
- `POST /api/v4/security/sessions/revoke-others`
- `GET/POST /api/v4/portfolios`
- `GET /api/v4/portfolios/:id`
- `GET /api/v4/brokers`
- `POST /api/v4/brokers/alpaca`
- `POST /api/v4/brokers/:id/reconcile`
- `POST /api/v4/brokers/:id/live-permission`
- `GET/POST /api/v4/orders`
- `POST /api/v4/orders/:id/sync`
- `POST /api/v4/orders/:id/cancel`
- `GET /api/v4/ledger`
- `GET/POST /api/v4/strategies`
- `POST /api/v4/strategies/:id/versions`
- `GET/POST /api/v4/lean/jobs`
- `GET /api/v4/quote/:symbol`
- `GET /api/v4/notifications`
- `POST /api/v4/notifications/:id/read`
- `POST /api/v4/notifications/read-all`
- `GET /api/v4/reconciliation/issues`
- `GET /api/v4/audit/me`
- `GET /api/v4/audit` (admin)
- `GET /api/v4/ops/health`
- `GET /api/v4/ops/metrics` (admin)

Order creation requires an `Idempotency-Key` header.

## Product architecture

```text
Web / future mobile
        |
        v
TradePilot API + WebSocket gateway
        |
  +-----+-------------------------------+
  | Identity / MFA / Sessions           |
  | Portfolio / Ledger                  |
  | OMS -> Pre-trade Risk -> Broker API |
  | Research / AI (non-execution)       |
  | Strategy control plane              |
  +-----+-------------------------------+
        |
   PostgreSQL       Redis
        |             |
        +------ Job/Event state
                     |
             independent workers
                     |
              LEAN gateway pool
                     |
               LEAN containers
```

## Trading vs investing product modes

The UI navigation is now organized around:
- **Platform** — account/control-plane overview
- **Trade** — terminals, broker accounts, automation and LEAN
- **Invest** — long-term portfolios and benchmarks
- **Research** — scanners, news, watchlists and strategy lab
- **Analytics** — performance, journal and reports
- **Operations** — agents, alerts, security/settings

This keeps active trading and long-term investing as distinct user journeys while reusing the same identity, portfolio and accounting infrastructure.

## Security notes

Required production settings:
- use PostgreSQL, not SQLite;
- set a strong unique `APP_AUTH_SECRET`;
- set a strong unique `APP_DATA_ENCRYPTION_KEY` (KMS-injected in mature deployments);
- use HTTPS/WSS only;
- configure transactional email;
- configure Redis;
- keep both `ALLOW_LIVE_BROKER_CONNECTIONS=false` and `ALLOW_LIVE_BROKER_TRADING=false` until compliance, reconciliation, incident response and broker certification are complete;
- rotate credentials and encryption keys using a documented key-version migration;
- run penetration/load/failure tests before a public launch.

`deploy/postgres-rls.sql` contains optional RLS policies. They are deliberately not auto-enabled until all legacy/background queries execute within tenant-scoped DB transactions.

## AI execution boundary

The existing AI/research stack remains advisory. The OMS never allows an AI provider to call a broker directly. Any automated idea must pass deterministic risk controls and an authorized strategy/order path.

## Regulatory boundary

The recommended first public architecture is non-custodial: user assets remain at the connected broker. This code does not make the operator licensed, registered or compliant in any jurisdiction. Before live customer trading, obtain specialist legal/compliance review for every intended country, broker relationship and product behavior (execution, advice, discretionary management, copy trading, custody, reporting and marketing).

## Mobile

No separate mobile business logic is required. A future React Native/SwiftUI/Android client should consume the same `/api/v4` endpoints and realtime ticket/WebSocket flow. Keep broker secrets server-side; mobile apps should never receive them.

## Recommended release gates

1. Local/dev: SQLite allowed only for legacy development; v4 production testing should use PostgreSQL.
2. Staging: PostgreSQL + Redis + paper brokers + 2+ API replicas + worker pool.
3. Private beta: paper only, 10-50 users, load/failure testing and reconciliation drills.
4. Controlled live pilot: only after broker/legal/security approval, explicit operator live flag, restricted accounts and low limits.
5. Scale: autoscaled API nodes, dedicated realtime gateway, multiple LEAN gateway hosts, managed KMS/secrets and full telemetry.
