-- Add AI provider routing, analysis storage, and worker locks.
ALTER TABLE "TradePlan" ADD COLUMN "signalKey" TEXT;
ALTER TABLE "TradePlan" ADD COLUMN "analysisId" TEXT;

ALTER TABLE "PaperTrade" ADD COLUMN "signalKey" TEXT;
ALTER TABLE "PaperTrade" ADD COLUMN "analysisId" TEXT;

CREATE TABLE "AIAnalysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT,
  "tradeId" TEXT,
  "symbol" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "reasoningJson" TEXT NOT NULL,
  "risksJson" TEXT NOT NULL,
  "catalystsJson" TEXT NOT NULL,
  "invalidationConditionsJson" TEXT NOT NULL,
  "sourceQuality" TEXT NOT NULL,
  "inputSummary" TEXT NOT NULL,
  "rawResponseReference" TEXT,
  "inputHash" TEXT NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "technicalOnly" BOOLEAN NOT NULL DEFAULT false,
  "cached" BOOLEAN NOT NULL DEFAULT false,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AIProviderHealth" (
  "provider" TEXT NOT NULL PRIMARY KEY,
  "healthy" BOOLEAN NOT NULL DEFAULT true,
  "lastSuccessAt" DATETIME,
  "lastFailureAt" DATETIME,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "disabledUntil" DATETIME,
  "lastErrorCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WorkerLock" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Idle',
  "heartbeatAt" DATETIME,
  "lockedUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "TradePlan_analysisId_idx" ON "TradePlan"("analysisId");
CREATE INDEX "TradePlan_signalKey_idx" ON "TradePlan"("signalKey");
CREATE INDEX "PaperTrade_signalKey_idx" ON "PaperTrade"("signalKey");
CREATE INDEX "PaperTrade_analysisId_idx" ON "PaperTrade"("analysisId");
CREATE INDEX "AIAnalysis_symbol_idx" ON "AIAnalysis"("symbol");
CREATE INDEX "AIAnalysis_inputHash_idx" ON "AIAnalysis"("inputHash");
CREATE INDEX "AIAnalysis_createdAt_idx" ON "AIAnalysis"("createdAt");
CREATE INDEX "AIAnalysis_provider_idx" ON "AIAnalysis"("provider");
CREATE INDEX "AIAnalysis_tradeId_idx" ON "AIAnalysis"("tradeId");
CREATE INDEX "WorkerLock_lockedUntil_idx" ON "WorkerLock"("lockedUntil");
CREATE INDEX "WorkerLock_heartbeatAt_idx" ON "WorkerLock"("heartbeatAt");
