# Migrating an existing TradePilot 3.x installation to Professional v4

## Recommended path

1. Put the old application in maintenance mode and stop automation workers.
2. Back up the database and broker/configuration secrets.
3. Deploy v4 first to a staging environment with a copy of production data.
4. For PostgreSQL, run `deploy/postgres-v4-preflight.sql` **before** Prisma `db push` if the database already contains legacy rows.
5. Run `npm run prisma:generate:postgres --prefix backend` and `npm run prisma:deploy:postgres --prefix backend`.
6. Run the v4 seed only on a development/demo database, not over production customer data.
7. Configure one shared `APP_DATA_ENCRYPTION_KEY` across the API, LEAN worker and reconciliation worker.
8. Keep `ALLOW_LIVE_BROKER_CONNECTIONS=false` and `ALLOW_LIVE_BROKER_TRADING=false` until paper/staging validation is complete.
9. Start API, LEAN worker, reconciliation worker and automation worker as separate processes.
10. Reconnect each user's broker account through `/api/v4/brokers/alpaca`; old environment-level credentials are not converted into user credentials automatically.

## Legacy ownership backfill

TradePilot 3.x stored several resources globally. The preflight script assigns those rows to the oldest existing user so schema migration can complete. Review that ownership manually before exposing the upgraded system to multiple people.

The affected legacy resources are watchlists, journals, alerts, trade plans and paper trades. New v4 resources are tenant-owned from creation.

## SQLite development databases

For local SQLite, the safest v4 development migration is to keep a copy of the old `dev.db`, create a fresh v4 database with `npm run prisma:deploy --prefix backend`, then reseed/import only the legacy records you want. PostgreSQL is the supported production database for Professional v4.

## Post-migration hardening

After production schema deployment:

- Apply `deploy/postgres-ledger-immutability.sql` to enforce the append-only ledger.
- Keep `deploy/postgres-rls.sql` staged until request/background transactions set `app.user_id` consistently.
- Rotate any broker API key that was historically kept in shared environment variables if it is now being used as a per-user connection.
- Validate backup restore, broker reconciliation and idempotent order retry behavior before enabling live access.
