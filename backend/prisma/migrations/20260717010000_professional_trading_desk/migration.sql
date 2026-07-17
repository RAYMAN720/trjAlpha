-- Professional paper-trading desk: realistic execution, committee audit,
-- market-regime history, shadow strategies, and an emergency entry control.
ALTER TABLE "PaperTrade" ADD COLUMN "entryFee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaperTrade" ADD COLUMN "exitFee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaperTrade" ADD COLUMN "entrySlippage" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaperTrade" ADD COLUMN "exitSlippage" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PaperTrade" ADD COLUMN "executionModel" TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE "TradingControl" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "newEntriesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emergencyHalt" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "haltedAt" DATETIME,
  "resumedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "MarketRegimeSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetType" TEXT NOT NULL DEFAULT 'stock',
  "regime" TEXT NOT NULL,
  "longScore" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "allowLongBreakouts" BOOLEAN NOT NULL,
  "positionSizeMultiplier" REAL NOT NULL,
  "metricsJson" TEXT NOT NULL,
  "warningsJson" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ProfessionalDecisionRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetType" TEXT NOT NULL DEFAULT 'stock',
  "ticker" TEXT NOT NULL,
  "strategyName" TEXT NOT NULL,
  "strategyVersion" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "committeeScore" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "positionSizeMultiplier" REAL NOT NULL DEFAULT 0,
  "signalScore" INTEGER NOT NULL,
  "strategyScore" INTEGER NOT NULL,
  "marketRegime" TEXT NOT NULL,
  "riskState" TEXT NOT NULL,
  "executionGrade" TEXT NOT NULL,
  "riskRewardRatio" REAL NOT NULL,
  "signalKey" TEXT,
  "tradePlanId" TEXT,
  "paperTradeId" TEXT,
  "shadowOnly" BOOLEAN NOT NULL DEFAULT false,
  "votesJson" TEXT NOT NULL,
  "reasonsJson" TEXT NOT NULL,
  "contextJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ExecutionSimulation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paperTradeId" TEXT,
  "assetType" TEXT NOT NULL DEFAULT 'stock',
  "ticker" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "requestedPrice" REAL NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "filledQuantity" INTEGER NOT NULL,
  "partialFill" BOOLEAN NOT NULL DEFAULT false,
  "fillPrice" REAL NOT NULL,
  "estimatedBid" REAL NOT NULL,
  "estimatedAsk" REAL NOT NULL,
  "spreadBps" REAL NOT NULL,
  "slippageBps" REAL NOT NULL,
  "totalExecutionBps" REAL NOT NULL,
  "slippageAmount" REAL NOT NULL,
  "fee" REAL NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "participationRate" REAL NOT NULL,
  "qualityGrade" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "warningsJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ShadowTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetType" TEXT NOT NULL DEFAULT 'stock',
  "ticker" TEXT NOT NULL,
  "strategyName" TEXT NOT NULL,
  "strategyVersion" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'LONG',
  "entryPrice" REAL NOT NULL,
  "currentPrice" REAL NOT NULL,
  "exitPrice" REAL,
  "stopLoss" REAL NOT NULL,
  "takeProfit" REAL NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "profitLoss" REAL NOT NULL DEFAULT 0,
  "profitLossPercent" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "committeeScore" INTEGER NOT NULL,
  "marketRegime" TEXT NOT NULL,
  "sourceDecisionId" TEXT,
  "reason" TEXT NOT NULL,
  "contextJson" TEXT NOT NULL,
  "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "MarketRegimeSnapshot_assetType_idx" ON "MarketRegimeSnapshot"("assetType");
CREATE INDEX "MarketRegimeSnapshot_regime_idx" ON "MarketRegimeSnapshot"("regime");
CREATE INDEX "MarketRegimeSnapshot_capturedAt_idx" ON "MarketRegimeSnapshot"("capturedAt");
CREATE INDEX "ProfessionalDecisionRecord_assetType_idx" ON "ProfessionalDecisionRecord"("assetType");
CREATE INDEX "ProfessionalDecisionRecord_ticker_idx" ON "ProfessionalDecisionRecord"("ticker");
CREATE INDEX "ProfessionalDecisionRecord_decision_idx" ON "ProfessionalDecisionRecord"("decision");
CREATE INDEX "ProfessionalDecisionRecord_tradePlanId_idx" ON "ProfessionalDecisionRecord"("tradePlanId");
CREATE INDEX "ProfessionalDecisionRecord_paperTradeId_idx" ON "ProfessionalDecisionRecord"("paperTradeId");
CREATE INDEX "ProfessionalDecisionRecord_createdAt_idx" ON "ProfessionalDecisionRecord"("createdAt");
CREATE INDEX "ExecutionSimulation_paperTradeId_idx" ON "ExecutionSimulation"("paperTradeId");
CREATE INDEX "ExecutionSimulation_assetType_idx" ON "ExecutionSimulation"("assetType");
CREATE INDEX "ExecutionSimulation_ticker_idx" ON "ExecutionSimulation"("ticker");
CREATE INDEX "ExecutionSimulation_side_idx" ON "ExecutionSimulation"("side");
CREATE INDEX "ExecutionSimulation_createdAt_idx" ON "ExecutionSimulation"("createdAt");
CREATE INDEX "ShadowTrade_assetType_idx" ON "ShadowTrade"("assetType");
CREATE INDEX "ShadowTrade_ticker_idx" ON "ShadowTrade"("ticker");
CREATE INDEX "ShadowTrade_strategyName_idx" ON "ShadowTrade"("strategyName");
CREATE INDEX "ShadowTrade_status_idx" ON "ShadowTrade"("status");
CREATE INDEX "ShadowTrade_openedAt_idx" ON "ShadowTrade"("openedAt");
