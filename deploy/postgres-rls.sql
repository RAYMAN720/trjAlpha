-- TradePilot Professional v4 optional PostgreSQL RLS hardening.
--
-- The application already enforces tenant ownership in every v4 query. This file adds a
-- database-level second barrier. Enable it only after your DB request transaction sets:
--   SELECT set_config('app.user_id', '<authenticated-user-id>', true);
--
-- Background/system workers must similarly set the owning user before querying tenant rows.
-- Do not apply this file to production until that transaction-scoped context is enabled.

ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Strategy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WatchlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeanJobRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PerformanceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskSnapshot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_owner ON "Portfolio";
CREATE POLICY portfolio_owner ON "Portfolio"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS broker_account_owner ON "BrokerAccount";
CREATE POLICY broker_account_owner ON "BrokerAccount"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS order_owner ON "Order";
CREATE POLICY order_owner ON "Order"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS strategy_owner ON "Strategy";
CREATE POLICY strategy_owner ON "Strategy"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS notification_owner ON "Notification";
CREATE POLICY notification_owner ON "Notification"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS watchlist_owner ON "WatchlistItem";
CREATE POLICY watchlist_owner ON "WatchlistItem"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS journal_owner ON "JournalEntry";
CREATE POLICY journal_owner ON "JournalEntry"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS alert_owner ON "Alert";
CREATE POLICY alert_owner ON "Alert"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS auth_session_owner ON "AuthSession";
CREATE POLICY auth_session_owner ON "AuthSession"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS idempotency_owner ON "IdempotencyRecord";
CREATE POLICY idempotency_owner ON "IdempotencyRecord"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS lean_job_owner ON "LeanJobRecord";
CREATE POLICY lean_job_owner ON "LeanJobRecord"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS audit_owner ON "AuditEvent";
CREATE POLICY audit_owner ON "AuditEvent"
  USING ("userId" = current_setting('app.user_id', true));

-- Tables that inherit ownership through Portfolio.
DROP POLICY IF EXISTS position_owner ON "Position";
CREATE POLICY position_owner ON "Position"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Position"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "Position"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));

DROP POLICY IF EXISTS cash_owner ON "CashBalance";
CREATE POLICY cash_owner ON "CashBalance"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CashBalance"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "CashBalance"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));

DROP POLICY IF EXISTS ledger_owner ON "LedgerEntry";
CREATE POLICY ledger_owner ON "LedgerEntry"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "LedgerEntry"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "LedgerEntry"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));

DROP POLICY IF EXISTS reconciliation_owner ON "ReconciliationIssue";
CREATE POLICY reconciliation_owner ON "ReconciliationIssue"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "ReconciliationIssue"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "ReconciliationIssue"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));

DROP POLICY IF EXISTS performance_owner ON "PerformanceSnapshot";
CREATE POLICY performance_owner ON "PerformanceSnapshot"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "PerformanceSnapshot"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "PerformanceSnapshot"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));

DROP POLICY IF EXISTS risk_snapshot_owner ON "RiskSnapshot";
CREATE POLICY risk_snapshot_owner ON "RiskSnapshot"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "RiskSnapshot"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p.id = "RiskSnapshot"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));
