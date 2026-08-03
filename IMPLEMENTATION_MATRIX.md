# TradePilot Professional v4 — 33-point implementation matrix

This file maps every architectural change proposed for the Professional edition to the code delivered in this repository.

| # | Change | v4 implementation |
|---:|---|---|
| 1 | Evolve from single-user workstation | **Implemented.** The application is now a multi-user platform core with authenticated user identity, persistent sessions and tenant-owned data. |
| 2 | Tenant-isolate the database | **Implemented in application queries and schema.** Legacy watchlists, journals, alerts, trade plans and paper trades now carry ownership; canonical v4 data is rooted in `userId`/`portfolioId`. Optional PostgreSQL RLS hardening is provided in `deploy/postgres-rls.sql`. |
| 3 | First-class portfolios | **Implemented.** `Portfolio`, `CashBalance`, `Position`, performance/risk snapshots, portfolio-scoped orders, broker accounts and ledger entries. |
| 4 | Separate trading and investing | **Implemented at product/navigation and portfolio level.** The UI separates Platform/Trade/Invest/Research/Analytics/Operations and portfolios carry a type. Existing research/scanner features remain available. |
| 5 | Do not run one LEAN process for everyone | **Implemented.** `LeanJobRecord` + PostgreSQL queue + `leanWorker` + gateway concurrency replace the single-session assumption. |
| 6 | Keep LEAN out of normal manual order routing | **Implemented.** Manual orders flow through the canonical OMS and broker adapter; LEAN remains strategy/backtest/paper-engine infrastructure. |
| 7 | Real Order Management System | **Implemented.** Canonical `Order`/`OrderFill`, lifecycle states, cancellation, broker synchronization, partial fills, idempotency and user/portfolio/broker ownership. |
| 8 | Use decimal finance types | **Implemented in canonical v4 financial models.** Orders, positions, cash, fills, ledger and snapshots use Prisma `Decimal`; legacy simulator floats are retained only for backward compatibility. |
| 9 | Immutable financial ledger | **Implemented.** `LedgerEntry` is append-only by application design and `deploy/postgres-ledger-immutability.sql` enforces no UPDATE/DELETE at PostgreSQL level. Reconciliation uses compensating entries. |
| 10 | Event-driven architecture without premature microservices | **Implemented.** Modular monolith + domain-event bus + independent workers. |
| 11 | Redis | **Implemented.** Dependency-free Redis client supports cache, rate limiting and pub/sub; PostgreSQL remains durable state. |
| 12 | WebSocket real-time updates | **Implemented.** Ticketed WebSocket gateway, per-user channels, heartbeat, Redis cross-instance pub/sub and frontend event-triggered refresh. |
| 13 | Broker abstraction | **Implemented.** `BrokerAdapter` interface and `AlpacaAdapter`; business order logic depends on the adapter contract. |
| 14 | Per-user encrypted broker credentials | **Implemented.** Credentials are stored per `BrokerAccount`, AES-256-GCM encrypted with application data-key versioning. Environment-level Alpaca execution remains operator-only legacy compatibility. |
| 15 | Production-grade authentication foundation | **Implemented.** Email OTP, verified-user creation, persistent hashed sessions, revocation, account disable checks, TOTP MFA and security-session APIs. Passcode login is off by default for production. |
| 16 | PostgreSQL Row-Level Security | **Prepared as defense-in-depth.** Application tenant enforcement is active; full RLS policies are supplied but intentionally not auto-enabled until every system/background transaction supplies `app.user_id`. See `deploy/postgres-rls.sql`. |
| 17 | Central pre-trade risk engine | **Implemented.** Manual orders pass deterministic portfolio/buying-power/position/daily-loss/concentration/live-mode controls before submission. |
| 18 | Idempotency | **Implemented.** Every canonical order submission requires `Idempotency-Key`; retries replay the prior result instead of duplicating orders. |
| 19 | Broker reconciliation | **Implemented.** Dedicated reconciliation worker compares broker cash, positions and open orders, corrects local state through ledger adjustments, syncs active OMS orders and surfaces unknown broker orders/issues. |
| 20 | Separate normalized market data | **Implemented.** Canonical normalized quote service with provider abstraction and Redis/DB cache; OMS risk uses server-side market data. |
| 21 | Separate AI from execution | **Implemented by architecture.** Existing AI/research produces analysis only; the canonical execution route requires deterministic OMS/risk/broker steps. |
| 22 | Version every strategy | **Implemented.** `Strategy` → immutable `StrategyVersion` with code hash, parameters, source reference, approval state, deployments and LEAN job linkage. |
| 23 | Environment separation | **Implemented as deployment policy and guards.** LOCAL/DEV/STAGING/PAPER/PRODUCTION guidance is in `deploy/ENVIRONMENTS.md`; live broker connection and live execution are two separate fail-closed flags. |
| 24 | Observability | **Implemented foundation.** Structured JSON logging, request IDs, HTTP metrics/Prometheus endpoint, health endpoint and worker logs. External Grafana/Datadog/OpenTelemetry collectors can consume these signals. |
| 25 | Audit everything | **Implemented.** `AuditEvent` captures user/session/IP/user-agent/action/resource/metadata for security and trading actions. User and admin audit APIs are included. |
| 26 | Professional trading UX | **Implemented as v4 control plane.** New Platform screen includes portfolios, encrypted brokers, risk-gated order ticket, strategies, LEAN jobs and live updates while retaining the existing scanner/research UI. |
| 27 | Mobile later, shared API | **Architecturally satisfied; mobile app intentionally not duplicated.** All v4 business logic lives behind APIs so a future React Native app can reuse it. |
| 28 | Production infrastructure | **Implemented.** Backend/frontend Dockerfiles, production Docker Compose with PostgreSQL/Redis/API/three worker roles, Render blueprint, deployment checklist and separate LEAN gateway. |
| 29 | Regulatory boundary | **Implemented as technical boundary, not legal approval.** v4 is non-custodial/broker-connected; live trading is disabled by default, MFA-gated and operator-gated. Legal, broker and jurisdictional approvals remain external launch requirements. |
| 30 | Staged rollout roadmap | **Documented.** `PROFESSIONAL_V4.md` and `deploy/PRODUCTION_CHECKLIST.md` define controlled paper/staging/live launch gates. |
| 31 | Modular backend structure | **Implemented.** New `modules/` areas cover portfolios, brokers, trading/OMS, risk, market data, strategies, LEAN and reconciliation; workers and shared infrastructure are separated. |
| 32 | Repository-specific critical priorities | **Implemented across schema/auth/OMS/ledger/LEAN/credential encryption/risk/Redis/realtime/reconciliation/audit.** Legacy endpoints are preserved but sensitive global-broker routes are operator-only. |
| 33 | Target scalable architecture | **Implemented as the v4 baseline.** React → authenticated API → modular core → PostgreSQL/Redis → broker adapters + independent LEAN/reconciliation/automation workers, with room to split services only when scale requires it. |

## Important distinction

“Implemented” here means the source architecture and application controls are present in this repository. It does **not** mean a real-money financial service is automatically licensed, broker-certified, penetration-tested, load-tested or approved for a jurisdiction. Those are deployment/operational gates, not source-code features.
