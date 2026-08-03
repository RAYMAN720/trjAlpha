-- Run ONLY when upgrading an existing PostgreSQL TradePilot 3.x database with data.
-- Fresh v4 databases do not need this script.
-- Back up first.

DO $$
DECLARE
  owner_id text;
BEGIN
  SELECT id INTO owner_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'No existing User row is available for legacy ownership backfill. Create/migrate a user first.';
  END IF;

  ALTER TABLE "WatchlistItem" ADD COLUMN IF NOT EXISTS "userId" text;
  UPDATE "WatchlistItem" SET "userId" = owner_id WHERE "userId" IS NULL;
  ALTER TABLE "WatchlistItem" ALTER COLUMN "userId" SET NOT NULL;

  ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "userId" text;
  UPDATE "JournalEntry" SET "userId" = owner_id WHERE "userId" IS NULL;
  ALTER TABLE "JournalEntry" ALTER COLUMN "userId" SET NOT NULL;

  ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "userId" text;
  UPDATE "Alert" SET "userId" = owner_id WHERE "userId" IS NULL;
  ALTER TABLE "Alert" ALTER COLUMN "userId" SET NOT NULL;

  ALTER TABLE "TradePlan" ADD COLUMN IF NOT EXISTS "userId" text;
  UPDATE "TradePlan" SET "userId" = owner_id WHERE "userId" IS NULL;
  ALTER TABLE "TradePlan" ALTER COLUMN "userId" SET NOT NULL;

  ALTER TABLE "PaperTrade" ADD COLUMN IF NOT EXISTS "userId" text;
  UPDATE "PaperTrade" SET "userId" = owner_id WHERE "userId" IS NULL;
  ALTER TABLE "PaperTrade" ALTER COLUMN "userId" SET NOT NULL;
END $$;
