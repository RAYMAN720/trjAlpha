-- TradePilot Professional v4: enforce append-only financial ledger semantics.
-- Apply after the PostgreSQL schema is deployed. Run with a migration/admin role.
-- The application may INSERT LedgerEntry rows but must never UPDATE or DELETE them.

CREATE OR REPLACE FUNCTION tradepilot_reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only: % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS tradepilot_ledger_no_update ON "LedgerEntry";
CREATE TRIGGER tradepilot_ledger_no_update
BEFORE UPDATE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION tradepilot_reject_ledger_mutation();

DROP TRIGGER IF EXISTS tradepilot_ledger_no_delete ON "LedgerEntry";
CREATE TRIGGER tradepilot_ledger_no_delete
BEFORE DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION tradepilot_reject_ledger_mutation();

COMMENT ON TABLE "LedgerEntry" IS
  'TradePilot append-only financial ledger. Corrections are represented by compensating entries, never mutation.';
