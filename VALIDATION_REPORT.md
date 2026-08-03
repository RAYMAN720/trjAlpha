# TradePilot Professional v4 — Validation Report

## Completed checks

- TypeScript/TSX static syntax scan: **190 files**, **0 syntax diagnostics**.
- Local TypeScript/TSX import resolution scan: **0 missing local imports**.
- QuantConnect LEAN gateway: `node --check lean-gateway/src/server.mjs` passed.
- `deploy/docker-compose.pro.yml`: YAML parse passed.
- `render.yaml`: YAML parse passed.
- Root, backend, frontend, and LEAN gateway `package.json` files: JSON parse passed.
- Prisma schemas were structurally reviewed for the v4 ownership and finance model, including required user/portfolio relationships and finance `Decimal` fields.

## Deliberate launch gates

- Real-money broker **connection** is disabled unless `ALLOW_LIVE_BROKER_CONNECTIONS=true`.
- Real-money **execution** is separately disabled unless `ALLOW_LIVE_BROKER_TRADING=true`, the broker account is explicitly approved, MFA is enabled, and the live-trading confirmation flow succeeds.
- LEAN remains restricted to **BACKTEST/PAPER** execution. Normal user orders use the platform OMS and broker abstraction instead.
- PostgreSQL Row-Level Security policies are supplied in `deploy/postgres-rls.sql` as a staged defense-in-depth layer. They are **not enabled automatically** until every application and worker transaction consistently establishes the database user context.

## Environment limitation

A complete `npm ci` / full framework build could not be executed in the working environment because the configured npm registry returned 404 responses for existing dependencies. No new external runtime package was added for Redis/WebSocket infrastructure; those additions use built-in Node APIs. Before production deployment, run the normal install, typecheck, test, and build pipeline in an environment with npm registry access.

## Required pre-production validation

Before handling real customer money or broad public traffic, complete:

1. Dependency install + full TypeScript build in CI.
2. Prisma migration on a staging copy of the production database.
3. Unit/integration tests for auth, OMS, fills, ledger, reconciliation, and broker failures.
4. End-to-end paper-trading tests against the chosen broker sandbox.
5. Load tests for API, WebSockets, Redis, PostgreSQL, and LEAN workers.
6. Backup/restore and disaster-recovery drill.
7. Penetration/security review and secret-rotation exercise.
8. Legal/compliance review for every jurisdiction and product mode offered.
