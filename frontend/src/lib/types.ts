export type AssetType = "stock" | "crypto";

export type UserSettings = {
  id: string;
  name: string;
  email: string;
  demoCapital: number;
  riskPerTradePercent: number;
  maxOpenTrades: number;
  maxDailyLossPercent: number;
  displayCurrency: "USD" | string;
  beginnerMode: boolean;
  autoPaperTrading: boolean;
  realTradingEnabled: boolean;
};

export type MarketSignal = {
  id: string;
  assetType?: AssetType;
  scanId: string;
  ticker: string;
  signalType: string;
  score: number;
  riskLevel: string;
  decision: string;
  explanation: string;
  price: number;
  dailyChangePercent: number;
  relativeVolume: number;
  scoreBreakdownJson?: string;
  checklistJson?: string;
  strategyName?: string;
  strategyStatus?: string;
  researchQuality?: string;
  noTradeReasonsJson?: string;
  evidenceJson?: string;
  strategyProofJson?: string;
  createdAt: string;
  analysis?: AIAnalysisSummary | null;
};

export type MarketScan = {
  id: string;
  assetType?: AssetType;
  scanDate: string;
  market: string;
  totalScanned: number;
  signals: MarketSignal[];
};

export type Stock = {
  id?: string;
  assetType?: AssetType;
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  previousClose: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  dailyChangePercent: number;
  quoteSource?: string;
  quoteUpdatedAt?: string;
  marketState?: string;
  signal?: MarketSignal | null;
};

export type ResearchReport = {
  id: string;
  assetType?: AssetType;
  ticker: string;
  companyName: string;
  summary: string;
  whyDetected: string;
  bullCase: string;
  bearCase: string;
  risks: string;
  fundamentals: string;
  valuationComment: string;
  technicalPicture: string;
  catalysts: string;
  aiScore: number;
  confidence: number;
  riskLevel: string;
  decision: string;
  sourcesJson: string;
  scoreBreakdownJson?: string;
  checklistJson?: string;
  strategyName?: string;
  strategyStatus?: string;
  researchQuality?: string;
  noTradeReasonsJson?: string;
  evidenceJson?: string;
  strategyProofJson?: string;
  dataSource?: string;
  catalystSource?: string;
  priceDataSource?: string;
  researchProvider?: string;
  aiProviderUsed?: string;
  confidenceQuality?: string;
  limitationsJson?: string;
  aiMode?: string;
  createdAt: string;
};

export type DocumentedInvestmentReport = {
  ticker: string;
  companyName: string;
  assetClass: "stocks" | "crypto";
  generatedAt: string;
  disclosure: string;
  executiveSummary: string;
  guidance: {
    stance: "Paper-trade candidate" | "Watchlist only" | "Avoid for now";
    timeHorizon: string;
    confidence: number;
    reasoning: string[];
    conditionsBeforeAction: string[];
    invalidationConditions: string[];
    riskControls: string[];
    stopLoss?: number;
    takeProfit?: number;
    riskRewardRatio?: number;
  };
  studies: Array<{
    title: string;
    findings: string[];
  }>;
  evidenceTable: Array<{
    metric: string;
    value: string;
    interpretation: string;
  }>;
  sources: Array<{
    title: string;
    url: string;
    reliability: "high" | "medium" | "low";
  }>;
  markdown: string;
};

export type TradePlan = {
  id: string;
  assetType?: AssetType;
  ticker: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  quantity: number;
  maxLoss: number;
  riskRewardRatio: number;
  reasoning: string;
  status: string;
  professionalJson?: string;
  strategyName?: string;
  strategyStatus?: string;
  researchQuality?: string;
  createdAt: string;
};

export type PaperTrade = {
  id: string;
  assetType?: AssetType;
  ticker: string;
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number | null;
  quantity: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  profitLoss: number;
  profitLossPercent: number;
  entryFee?: number;
  exitFee?: number;
  entrySlippage?: number;
  exitSlippage?: number;
  executionModel?: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  tradePlanId?: string | null;
  signalKey?: string | null;
  analysisId?: string | null;
  analysis?: AIAnalysisSummary | null;
};

export type PaperAccount = {
  id: string;
  userId: string;
  currency: string;
  startingBalance: number;
  cashBalance: number;
  availableCash: number;
  usedCapital: number;
  openPositionsValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalEquity: number;
  totalReturnPercent: number;
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
  maxDrawdown: number;
  buyingPowerPaper: number;
  totalFeesSimulated: number;
  totalSlippageSimulated: number;
  createdAt: string;
  updatedAt: string;
};

export type PaperPosition = {
  id: string;
  accountId: string;
  sourcePaperTradeId?: string | null;
  assetType: AssetType;
  ticker: string;
  symbol: string;
  assetName: string;
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number | null;
  quantity: number;
  positionValue: number;
  initialPositionValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  pnlPercent: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number | null;
  strategyName: string;
  entryReason: string;
  exitReason?: string | null;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquitySnapshot = {
  id: string;
  accountId: string;
  totalEquity: number;
  cashBalance: number;
  openPositionsValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  drawdown: number;
  createdAt: string;
};

export type PaperAccountSummary = {
  account: PaperAccount;
  openPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  snapshots: EquitySnapshot[];
  activityFeed: PaperTradeEvent[];
  paperOnly: boolean;
  realTradingEnabled: boolean;
  noLeverage: boolean;
  noMargin: boolean;
  noFutures: boolean;
};

export type WatchlistItem = {
  id: string;
  assetType?: AssetType;
  ticker: string;
  companyName: string;
  score: number;
  riskLevel: string;
  decision: string;
  notes?: string | null;
  createdAt: string;
};

export type JournalEntry = {
  id: string;
  ticker: string;
  decision: string;
  entryReason: string;
  exitReason?: string | null;
  emotion: string;
  mistake?: string | null;
  lesson: string;
  aiReview?: string | null;
  result: string;
  createdAt: string;
};

export type Alert = {
  id: string;
  assetType?: AssetType;
  ticker: string;
  alertType: string;
  targetPrice?: number | null;
  message: string;
  severity: string;
  active: boolean;
  readAt?: string | null;
  createdAt: string;
};

export type ChartPoint = {
  date: string;
  price: number;
  volume: number;
};

export type TradeCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9: number;
  ema20: number;
  ema50: number;
  sma200: number;
  rsi: number;
  macd: number;
  atr: number;
  support: number;
  resistance: number;
};

export type CandleResponse = {
  assetType: AssetType;
  symbol: string;
  timeframe: string;
  dataQuality: string;
  quoteUpdatedAt: string;
  candles: TradeCandle[];
};

export type TradeChartMarker = {
  id: string;
  positionId?: string | null;
  assetType: AssetType;
  ticker: string;
  symbol: string;
  markerType: "BUY" | "SELL" | string;
  price: number;
  time: string;
  label: string;
  colorType: string;
  reason?: string | null;
  createdAt: string;
};

export type PositionLine = {
  type: string;
  price: number;
  label: string;
  colorType: string;
};

export type AssetLogoInfo = {
  assetType: AssetType;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  provider: string;
  fallbackText: string;
  fallbackColor: string;
  dataQuality: string;
};

export type AssetProfile = {
  assetType: AssetType;
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price?: number | null;
  dailyChangePercent?: number | null;
  marketCap?: number | null;
  volume?: number | null;
  dataQuality: string;
  logo: AssetLogoInfo;
};

export type ScannerJob = {
  id: string;
  name: string;
  status: string;
  cadence: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  runCount: number;
  lastSummary?: string | null;
  lastError?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AutomationStatus = {
  autoScanOn: boolean;
  paperTradingOnly: boolean;
  realTradingEnabled: boolean;
  autoPaperTrading: boolean;
  marketScannerStatus: string;
  lastScanTime?: string | null;
  nextScanTime?: string | null;
  jobsRunning: string[];
  workerHeartbeatAt?: string | null;
  openPaperTrades: number;
  activeAlerts: number;
  jobs: ScannerJob[];
};

export type AnalysisEngineStatus = {
  enabled: true;
  engine: "typescript";
  connected: boolean;
  lastAnalysisAt?: string | null;
  engines: {
    indicators: "active";
    multiTimeframe: "active";
    backtesting: "active";
    risk: "active";
  };
  paperTradingOnly: true;
  realTradingEnabled: false;
};

export type AIProviderHealth = {
  provider: string;
  healthy: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  failureCount: number;
  disabledUntil?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AIAnalysisSummary = {
  id: string;
  symbol?: string;
  provider: "openai" | "mistral" | "technical" | string;
  model: string;
  status: string;
  recommendation: string;
  confidence: number;
  sourceQuality?: string;
  fallbackUsed: boolean;
  technicalOnly: boolean;
  cached: boolean;
  errorCode?: string | null;
  createdAt: string;
};

export type AIStatus = {
  config: {
    primaryProvider: string;
    fallbackProvider: string;
    fallbackEnabled: boolean;
    technicalFallbackEnabled: boolean;
    openaiConfigured: boolean;
    mistralConfigured: boolean;
    remoteLocalConfigured: boolean;
    ollamaEnabled: boolean;
    ollamaConfigured: boolean;
    localModelProvider: string;
    openaiModel: string;
    mistralModel: string;
    localModelModel?: string | null;
    ollamaModel: string;
    maxCallsPerHour: number;
    maxCallsPerDay: number;
    cacheMinutes: number;
    dailyBudgetUsd: number;
    minSignalScore: number;
    paperTradingEnabled: boolean;
    liveBrokerTradingAllowed: boolean;
    autoSubmitBrokerPaperOrders: boolean;
  };
  mode: string;
  primaryProvider: string;
  fallbackProvider: string;
  providerHealth: AIProviderHealth[];
  primaryProviderStatus: string;
  fallbackProviderStatus: string;
  remoteProviderStatus?: string;
  ollamaProviderStatus?: string;
  providerDiagnostics: Array<{
    provider: string;
    configured: boolean;
    model: string;
    status: string;
    lastErrorCode?: string | null;
    lastFailureAt?: string | null;
    lastSuccessAt?: string | null;
    disabledUntil?: string | null;
    hint: string;
  }>;
  lastSuccessfulExternalCall?: string | null;
  hourlyCalls: number;
  dailyCalls: number;
  dailyEstimatedCostUsd: number;
  dailyBudgetUsd: number;
  technicalOnlyActive: boolean;
  lastAIError?: string | null;
  cacheHitRate: number;
  workerHeartbeatAt?: string | null;
  recentAnalyses: AIAnalysisSummary[];
};

export type AgentRun = {
  id: string;
  assetType?: AssetType;
  agentName: string;
  jobName?: string | null;
  status: string;
  inputTicker?: string | null;
  inputJson: string;
  outputSummary: string;
  outputJson: string;
  error?: string | null;
  createdAt: string;
};

export type StrategyPerformance = {
  id: string;
  scope: string;
  scopeValue: string;
  tradeCount: number;
  winRate: number;
  averageGain: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  bestSignalType?: string | null;
  worstSignalType?: string | null;
  bestSector?: string | null;
  worstSector?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type LearningInsight = {
  id: string;
  assetType?: AssetType;
  title: string;
  insight: string;
  confidence: number;
  category: string;
  createdAt: string;
};

export type LearningSummary = {
  performance?: StrategyPerformance | null;
  insights: LearningInsight[];
  predictionCount: number;
  winRate: number;
  averageGain: number;
  averageLoss: number;
};

export type PaperTradeEvent = {
  id: string;
  assetType?: AssetType;
  accountId?: string | null;
  positionId?: string | null;
  paperTradeId?: string | null;
  ticker: string;
  symbol?: string | null;
  eventType: string;
  price?: number | null;
  quantity?: number | null;
  positionValue?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  profitLoss?: number | null;
  reason?: string | null;
  strategyName?: string | null;
  candleTime?: string | null;
  message: string;
  createdAt: string;
};

export type RiskEvent = {
  id: string;
  assetType?: AssetType;
  ticker?: string | null;
  rule: string;
  severity: string;
  blocked: boolean;
  message: string;
  contextJson: string;
  createdAt: string;
};

export type BacktestResult = {
  id: string;
  assetType?: AssetType;
  strategyName: string;
  startDate: string;
  endDate: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  summary: string;
  createdAt: string;
};

export type BrokerConnection = {
  id: string;
  provider: string;
  environment: string;
  status: string;
  accountNumber?: string | null;
  currency?: string | null;
  buyingPower?: number | null;
  cash?: number | null;
  portfolioValue?: number | null;
  isLive: boolean;
  liveTradingAllowed: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrokerStatus = {
  provider: string;
  environment: "paper" | "live";
  authMode: "api_key" | "oauth_client_credentials";
  configured: boolean;
  oauthConfigured: boolean;
  baseUrl: string;
  authBaseUrl: string;
  paperTradingReady: boolean;
  realTradingEnabled: boolean;
  liveTradingAllowed: boolean;
  connection?: BrokerConnection | null;
};

export type BrokerOrder = {
  id: string;
  provider: string;
  environment: string;
  brokerOrderId?: string | null;
  ticker: string;
  side: string;
  orderType: string;
  timeInForce: string;
  quantity: number;
  notional?: number | null;
  limitPrice?: number | null;
  stopPrice?: number | null;
  takeProfitPrice?: number | null;
  status: string;
  source: string;
  tradePlanId?: string | null;
  paperTradeId?: string | null;
  requestJson: string;
  responseJson?: string | null;
  error?: string | null;
  realMoneyBlocked: boolean;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetDashboard = {
  assetType: AssetType;
  market: "stocks" | "crypto";
  settings: UserSettings;
  scan: MarketScan | null;
  paperTradingOnly: boolean;
  realTradingEnabled: boolean;
  openPaperTrades: number;
  totalPaperTrades: number;
  todayProfit: number;
  totalProfit: number;
  totalOpenRisk: number;
  paperAccount?: PaperAccount;
  accountCurrency?: string;
  totalEquity?: number;
  cashBalance?: number;
  openPositionsValue?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  bestCandidate?: MarketSignal | null;
  autoScannerOn: boolean;
  autoPaperTrading: boolean;
  lastScanTime?: string | null;
  nextScanTime?: string | null;
};

export type MarketNewsItem = {
  id: string;
  assetType: AssetType;
  ticker: string;
  symbol: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  sentiment: "bullish" | "bearish" | "neutral";
  impactLevel: "low" | "medium" | "high" | "critical";
  catalystType: string;
  timeSensitivity: "low" | "medium" | "high";
  bullishInterpretation: string;
  bearishInterpretation: string;
  riskWarning: string;
  scoreImpact: number;
  decision: string;
  confidence: number;
  dataQuality: string;
  aiMode?: string;
  note?: string;
};

export type NewsScanResult = {
  provider: string;
  status: "ok" | "fallback";
  scannedAt: string;
  count: number;
  items: MarketNewsItem[];
  warning?: string;
};

export type NewsStatus = {
  provider: string;
  finnhubConfigured: boolean;
  polygonConfigured: boolean;
  aiAnalysisEnabled: boolean;
  refreshIntervalMinutes: number;
  maxArticlesPerScan: number;
  paperOnly: boolean;
  warning: string;
};

export type DailyBriefing = {
  generatedAt: string;
  marketMood: string;
  stocks: MarketBriefing;
  crypto: MarketBriefing;
  bestOpportunities: {
    stocks: string[];
    crypto: string[];
  };
  risksToday: string[];
  noTradeWarning?: string | null;
  safety: string[];
};

export type MarketBriefing = {
  assetType: AssetType;
  generatedAt: string;
  marketMood: string;
  marketRegime: string;
  bestOpportunities: string[];
  risksToday: string[];
  noTradeWarning?: string | null;
  topGainers?: Array<{ ticker: string; move: number; price: number }>;
  topLosers?: Array<{ ticker: string; move: number; price: number }>;
  highVolumeNames?: Array<{ ticker: string; relativeVolume: number; move: number }>;
  strongestSectors?: Array<{ sector: string; averageMove: number; namesTracked: number }>;
  weakestSectors?: Array<{ sector: string; averageMove: number; namesTracked: number }>;
  btcTrend?: string;
  ethTrend?: string;
  cryptoRiskState?: string;
  strongestCryptoNarratives?: Array<{ name: string; score: number }>;
  highVolatilityAssets?: Array<{ ticker: string; move: number; industry: string }>;
};

export type NoTradeStatus = {
  market: "stocks" | "crypto";
  assetType: AssetType;
  noTradeToday: boolean;
  headline: string;
  reasons: string[];
  bestCandidate?: MarketSignal | null;
  bestRejectedCandidates: Array<{
    ticker: string;
    score: number;
    decision: string;
    whyRejected?: string;
    conditionNeeded: string;
  }>;
  riskState: string;
  generatedAt: string;
};

export type RiskStatus = {
  state: string;
  paperOnly: boolean;
  realTradingEnabled: boolean;
  openTrades: number;
  dailyPl: number;
  weeklyPl: number;
  dailyLossLimit: number;
  weeklyLossLimit: number;
  lossesInRow: number;
  maxConsecutiveLosses: number;
  tradesOpenedToday: number;
  maxDailyTrades: number;
  currentDrawdownPercent: number;
  maxAccountDrawdownPercent: number;
  tradePaused: boolean;
  reducedSizeMultiplier: number;
  reasons: string[];
};

export type PlaybookStatus = {
  name: string;
  assetType: AssetType;
  proofLevel: string;
  status: string;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  last10Trades: Array<{ ticker: string; result: number; closedAt?: string | null }>;
  enabled: boolean;
  paperOnly: true;
  setupConditions: string[];
  entryRules: string[];
  noTradeConditions: string[];
  minimumScore: number;
};

export type BenchmarkStatus = {
  stocks: BenchmarkBucket;
  crypto: BenchmarkBucket;
  overall: BenchmarkBucket;
  generatedAt: string;
  paperOnly: boolean;
  realTradingEnabled: boolean;
};

export type BenchmarkBucket = {
  assetType: string;
  level: string;
  closedTrades: number;
  profitFactor: number;
  maxDrawdown: number;
  winRate: number;
  regimesTested: number;
  badges: string[];
  disclaimer: string;
};

export type WeeklyTraderReport = {
  generatedAt: string;
  periodStart: string;
  totalTrades: number;
  closedTrades: number;
  winRate: number;
  profitFactor: number;
  profitLoss: number;
  maxDrawdown: number;
  bestStrategy: string;
  worstStrategy: string;
  biggestMistake: string;
  bestSetup: string;
  noTradeDecisions: number;
  blockedRiskyTrades: number;
  stockVsCryptoPerformance: {
    stocks: BenchmarkBucket;
    crypto: BenchmarkBucket;
  };
  recommendationsForNextWeek: string[];
  disclaimer: string;
};

export type TradingControl = {
  id: string;
  newEntriesEnabled: boolean;
  emergencyHalt: boolean;
  reason?: string | null;
  haltedAt?: string | null;
  resumedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfessionalMarketRegime = {
  regime: "BULL_TREND" | "BULL_VOLATILE" | "SIDEWAYS" | "BEAR_TREND" | "RISK_OFF" | "UNKNOWN";
  longScore: number;
  confidence: number;
  allowLongBreakouts: boolean;
  positionSizeMultiplier: number;
  metrics: {
    trackedAssets: number;
    advancersPercent: number;
    strongAdvancersPercent: number;
    declinersPercent: number;
    averageChangePercent: number;
    medianAbsoluteMovePercent: number;
    benchmarkClose: number | null;
    benchmarkSma50: number | null;
    benchmarkSma200: number | null;
    benchmarkReturn20Percent: number | null;
    benchmarkVolatility20Percent: number | null;
  };
  summary: string;
  warnings: string[];
};

export type CommitteeVote = {
  desk: "STRATEGY" | "RISK" | "REGIME" | "EXECUTION" | "DATA" | "AI_RESEARCH";
  weight: number;
  score: number;
  passed: boolean;
  veto: boolean;
  reason: string;
};

export type ProfessionalDecision = {
  id: string;
  assetType: AssetType;
  ticker: string;
  strategyName: string;
  strategyVersion: string;
  decision: "APPROVE_PAPER" | "WATCH" | "REJECT" | "BLOCKED" | string;
  committeeScore: number;
  confidence: number;
  positionSizeMultiplier: number;
  signalScore: number;
  strategyScore: number;
  marketRegime: string;
  riskState: string;
  executionGrade: string;
  riskRewardRatio: number;
  signalKey?: string | null;
  tradePlanId?: string | null;
  paperTradeId?: string | null;
  shadowOnly: boolean;
  votes: CommitteeVote[];
  reasons: string[];
  context?: unknown;
  createdAt: string;
};

export type ExecutionSimulationRecord = {
  id: string;
  paperTradeId?: string | null;
  assetType: AssetType;
  ticker: string;
  side: "BUY" | "SELL" | string;
  requestedPrice: number;
  requestedQuantity: number;
  filledQuantity: number;
  partialFill: boolean;
  fillPrice: number;
  estimatedBid: number;
  estimatedAsk: number;
  spreadBps: number;
  slippageBps: number;
  totalExecutionBps: number;
  slippageAmount: number;
  fee: number;
  latencyMs: number;
  participationRate: number;
  qualityGrade: string;
  modelVersion: string;
  warnings: string[];
  createdAt: string;
};

export type ExecutionSimulationSummary = {
  count: number;
  averageSlippageBps: number;
  averageTotalBps: number;
  totalFees: number;
  partialFillRate: number;
  recent: ExecutionSimulationRecord[];
};

export type ShadowTrade = {
  id: string;
  assetType: AssetType;
  ticker: string;
  strategyName: string;
  strategyVersion: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number | null;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  profitLoss: number;
  profitLossPercent: number;
  status: string;
  committeeScore: number;
  marketRegime: string;
  sourceDecisionId?: string | null;
  reason: string;
  openedAt: string;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShadowStrategySummary = {
  open: number;
  closed: number;
  winRate: number;
  profitFactor: number;
  totalProfitLoss: number;
  trades: ShadowTrade[];
};

export type MarketRegimeSnapshot = {
  id: string;
  assetType: AssetType;
  regime: string;
  longScore: number;
  confidence: number;
  allowLongBreakouts: boolean;
  positionSizeMultiplier: number;
  summary: string;
  capturedAt: string;
};

export type ProfessionalDesk = {
  paperOnly: true;
  realTradingEnabled: false;
  control: TradingControl;
  regime: ProfessionalMarketRegime;
  risk: RiskStatus;
  decisions: ProfessionalDecision[];
  execution: ExecutionSimulationSummary;
  shadow: ShadowStrategySummary;
  recentRegimes: MarketRegimeSnapshot[];
};
