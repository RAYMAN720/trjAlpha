import type {
  Alert,
  AIAnalysisSummary,
  AIStatus,
  AgentRun,
  AssetDashboard,
  AssetLogoInfo,
  AssetProfile,
  AutomationStatus,
  BacktestResult,
  BenchmarkStatus,
  BrokerOrder,
  BrokerStatus,
  CandleResponse,
  ChartPoint,
  DailyBriefing,
  DocumentedInvestmentReport,
  EquitySnapshot,
  JournalEntry,
  LearningSummary,
  LeanEngineStatus,
  LeanJob,
  MarketScan,
  MarketSignal,
  NewsScanResult,
  NewsStatus,
  PaperAccountSummary,
  PaperTrade,
  PaperTradeEvent,
  PositionLine,
  PlaybookStatus,
  ProfessionalDesk,
  TradingControl,
  ShadowStrategySummary,
  NoTradeStatus,
  ResearchReport,
  RiskStatus,
  RiskEvent,
  StrategyPerformance,
  Stock,
  TradeChartMarker,
  TradePlan,
  UserSettings,
  WeeklyTraderReport,
  WatchlistItem
} from "./types";
import type { MarketMode } from "./marketMode";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api");
const AUTH_TOKEN_KEY = "tradepilot_access_token";

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

function marketQuery(market?: MarketMode) {
  return market ? `?market=${market}` : "";
}

function marketPrefix(market?: MarketMode) {
  return market === "crypto" ? "/crypto" : "/stocks";
}

export type AuthSession = {
  ok: boolean;
  displayName: string;
  expiresAt: string;
};

export type LoginResponse = {
  token: string;
  expiresAt: string;
  displayName: string;
};

export type LoginCodeResponse = {
  ok: boolean;
  email: string;
  expiresAt: string;
  delivery: "email" | "development";
  devCode?: string;
};

export function getStoredAuthToken() {
  return safeGetItem(AUTH_TOKEN_KEY);
}

export function storeAuthToken(token: string) {
  safeSetItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  safeRemoveItem(AUTH_TOKEN_KEY);
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: Object.keys(headers).length ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 401) clearAuthToken();
    throw new Error(payload.error ?? "API request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => apiRequest<{ ok: boolean; mode: string; realTradingEnabled: boolean }>("/health"),
  login: (passcode: string) => apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { passcode }, auth: false }),
  requestLoginCode: () => apiRequest<LoginCodeResponse>("/auth/code/request", { method: "POST", body: {}, auth: false }),
  verifyLoginCode: (code: string) => apiRequest<LoginResponse>("/auth/code/verify", { method: "POST", body: { code }, auth: false }),
  session: () => apiRequest<AuthSession>("/auth/session"),
  settings: () => apiRequest<UserSettings>("/settings"),
  updateSettings: (body: Partial<UserSettings>) => apiRequest<UserSettings>("/settings", { method: "PUT", body }),
  dashboard: (market: MarketMode) => apiRequest<AssetDashboard>(`${marketPrefix(market)}/dashboard`),
  runScan: (filters?: Record<string, unknown>) => {
    const market = (filters?.market === "crypto" ? "crypto" : "stocks") as MarketMode;
    return apiRequest<MarketScan>(`${marketPrefix(market)}/scanner/run`, { method: "POST", body: filters ?? {} });
  },
  latestScan: (market?: MarketMode) =>
    market ? apiRequest<MarketScan | null>(`${marketPrefix(market)}/scanner/latest`) : apiRequest<MarketScan | null>("/scanner/latest"),
  signals: (market?: MarketMode) =>
    market ? apiRequest<MarketSignal[]>(`${marketPrefix(market)}/signals`) : apiRequest<MarketSignal[]>("/scanner/signals"),
  stock: (ticker: string, market?: MarketMode) => apiRequest<Stock>(`${marketPrefix(market)}/${ticker}`),
  chart: (ticker: string, market?: MarketMode) => apiRequest<ChartPoint[]>(`${marketPrefix(market)}/${ticker}/chart`),
  research: (ticker: string, market?: MarketMode) => apiRequest<ResearchReport>(`/research/${ticker}${marketQuery(market)}`),
  generateResearch: (ticker: string, market?: MarketMode) =>
    apiRequest<ResearchReport>(`${marketPrefix(market)}/${ticker}/research`, { method: "POST", body: { market } }),
  documentedReport: (ticker: string, market?: MarketMode) =>
    apiRequest<DocumentedInvestmentReport>(`/reports/investment/${ticker}${marketQuery(market)}`),
  createTradePlan: (ticker: string, market?: MarketMode) =>
    apiRequest<TradePlan>(`${marketPrefix(market)}/trade-plans`, { method: "POST", body: { ticker, symbol: ticker, market } }),
  tradePlans: (market?: MarketMode) => apiRequest<TradePlan[]>(`/trade-plans${marketQuery(market)}`),
  tradePlansForTicker: (ticker: string, market?: MarketMode) => apiRequest<TradePlan[]>(`/trade-plans/${ticker}${marketQuery(market)}`),
  approvePaperTrade: (tradePlanId: string) =>
    apiRequest<PaperTrade>("/paper-trades", { method: "POST", body: { tradePlanId } }),
  paperTrades: (market?: MarketMode) => apiRequest<PaperTrade[]>(market ? `${marketPrefix(market)}/paper-trades` : "/paper-trades"),
  openPaperTrades: (market?: MarketMode) => apiRequest<PaperTrade[]>(`/paper-trades/open${marketQuery(market)}`),
  closedPaperTrades: (market?: MarketMode) => apiRequest<PaperTrade[]>(`/paper-trades/closed${marketQuery(market)}`),
  paperTradeEvents: (id: string) => apiRequest<PaperTradeEvent[]>(`/paper-trades/${id}/events`),
  closePaperTrade: (id: string, body: { status?: string } = {}) =>
    apiRequest<PaperTrade>(`/paper-trades/${id}/close`, { method: "PUT", body }),
  updatePaperTradePrice: (id: string) =>
    apiRequest<PaperTrade>(`/paper-trades/${id}/update-price`, { method: "PUT", body: {} }),
  paperAccount: (market?: MarketMode) => apiRequest<PaperAccountSummary>(`/paper-account${marketQuery(market)}`),
  paperAccountEquity: () => apiRequest<{ account: PaperAccountSummary["account"]; snapshots: EquitySnapshot[] }>("/paper-account/equity"),
  resetPaperAccount: () => apiRequest<PaperAccountSummary["account"]>("/paper-account/reset", { method: "POST", body: {} }),
  candles: (assetType: "stock" | "crypto", symbol: string, timeframe = "1d") =>
    apiRequest<CandleResponse>(`/charts/${assetType}/${symbol}/candles?timeframe=${encodeURIComponent(timeframe)}`),
  chartMarkers: (assetType: "stock" | "crypto", symbol: string) =>
    apiRequest<TradeChartMarker[]>(`/charts/${assetType}/${symbol}/markers`),
  positionLines: (assetType: "stock" | "crypto", symbol: string) =>
    apiRequest<PositionLine[]>(`/charts/${assetType}/${symbol}/position-lines`),
  assetLogo: (assetType: "stock" | "crypto", symbol: string) => apiRequest<AssetLogoInfo>(`/assets/${assetType}/${symbol}/logo`),
  assetProfile: (assetType: "stock" | "crypto", symbol: string) => apiRequest<AssetProfile>(`/assets/${assetType}/${symbol}/profile`),
  latestNews: (market?: MarketMode, limit = 50) => apiRequest<NewsScanResult>(`/news/latest${market ? `?market=${market}&limit=${limit}` : `?limit=${limit}`}`),
  assetNews: (symbol: string, market?: MarketMode) =>
    apiRequest<NewsScanResult>(market === "crypto" ? `/news/crypto/${symbol}` : `/news/${symbol}${marketQuery(market)}`),
  scanNews: (market?: MarketMode, symbol?: string) => apiRequest<NewsScanResult>("/news/scan", { method: "POST", body: { market, symbol } }),
  newsStatus: () => apiRequest<NewsStatus>("/news/status"),
  activityFeed: (market?: MarketMode) => apiRequest<PaperTradeEvent[]>(`/activity-feed${marketQuery(market)}`),
  watchlist: (market?: MarketMode) => apiRequest<WatchlistItem[]>(`/watchlist${marketQuery(market)}`),
  addWatchlist: (ticker: string, extras?: Partial<WatchlistItem> & { market?: MarketMode }) =>
    apiRequest<WatchlistItem>("/watchlist", { method: "POST", body: { ticker, ...extras } }),
  removeWatchlist: (ticker: string, market?: MarketMode) => apiRequest<void>(`/watchlist/${ticker}${marketQuery(market)}`, { method: "DELETE" }),
  journal: () => apiRequest<JournalEntry[]>("/journal"),
  addJournal: (body: Omit<JournalEntry, "id" | "createdAt">) =>
    apiRequest<JournalEntry>("/journal", { method: "POST", body }),
  reviewJournal: (id: string) => apiRequest<JournalEntry>(`/journal/${id}/ai-review`, { method: "POST", body: {} }),
  alerts: (market?: MarketMode) => apiRequest<Alert[]>(`/alerts${marketQuery(market)}`),
  addAlert: (body: {
    ticker: string;
    market?: MarketMode;
    alertType?: string;
    targetPrice?: number | null;
    message?: string;
    severity?: string;
    active?: boolean;
  }) => apiRequest<Alert>("/alerts", { method: "POST", body }),
  readAlert: (id: string) => apiRequest<Alert>(`/alerts/${id}/read`, { method: "PUT", body: {} }),
  removeAlert: (id: string) => apiRequest<void>(`/alerts/${id}`, { method: "DELETE" }),
  automationStatus: () => apiRequest<AutomationStatus>("/automation/status"),
  dailyBriefing: () => apiRequest<DailyBriefing>("/briefing/daily"),
  marketBriefing: (market: MarketMode) => apiRequest<DailyBriefing["stocks"]>(market === "crypto" ? "/briefing/crypto" : "/briefing/stocks"),
  noTradeStatus: (market?: MarketMode) => apiRequest<NoTradeStatus>(`/no-trade/status${marketQuery(market)}`),
  riskStatus: (market?: MarketMode) => apiRequest<RiskStatus>(`/risk/status${marketQuery(market)}`),
  playbooksStatus: (market?: MarketMode) =>
    apiRequest<{ paperOnly: boolean; realTradingEnabled: boolean; playbooks: PlaybookStatus[] }>(`/playbooks/status${marketQuery(market)}`),
  benchmarkStatus: () => apiRequest<BenchmarkStatus>("/benchmark/status"),
  professionalDesk: (market?: MarketMode) => apiRequest<ProfessionalDesk>(`/professional/desk${marketQuery(market)}`),
  haltProfessionalEntries: (reason = "Manual professional safety halt from the dashboard.") =>
    apiRequest<TradingControl>("/professional/control/halt", { method: "POST", body: { reason } }),
  resumeProfessionalEntries: (reason = "Professional safety review completed from the dashboard.") =>
    apiRequest<TradingControl>("/professional/control/resume", { method: "POST", body: { reason } }),
  refreshShadowDesk: (market?: MarketMode) =>
    apiRequest<{ refresh: { checked: number; updated: number; closed: number }; summary: ShadowStrategySummary }>(`/professional/shadow/refresh${marketQuery(market)}`, { method: "POST", body: {} }),
  weeklyTraderReport: () => apiRequest<WeeklyTraderReport>("/reports/weekly"),
  aiStatus: () => apiRequest<AIStatus>("/ai/status"),
  aiAnalyses: () => apiRequest<AIAnalysisSummary[]>("/ai/analyses"),
  runAutomationJob: (name: string) => apiRequest<{ ok: boolean; summary: string }>(`/automation/jobs/${name}/run`, { method: "POST", body: {} }),
  setAutoPaperTrading: (autoPaperTrading: boolean) =>
    apiRequest<UserSettings>("/automation/auto-paper-trading", { method: "PUT", body: { autoPaperTrading } }),
  agentRuns: (market?: MarketMode) => apiRequest<AgentRun[]>(`/agents/runs${marketQuery(market)}`),
  learningSummary: (market?: MarketMode) => apiRequest<LearningSummary>(`/learning/summary${marketQuery(market)}`),
  strategyPerformance: (market?: MarketMode) =>
    apiRequest<{
      performance: StrategyPerformance[];
      events: PaperTradeEvent[];
      riskEvents: RiskEvent[];
      backtests: BacktestResult[];
    }>(`/strategy/performance${marketQuery(market)}`),
  brokerStatus: () => apiRequest<BrokerStatus>("/broker/status"),
  brokerSync: () => apiRequest<{ configured: boolean; connection: BrokerStatus["connection"]; error?: string }>("/broker/sync", { method: "POST", body: {} }),
  brokerOrders: () => apiRequest<BrokerOrder[]>("/broker/orders"),
  submitBrokerOrderFromTradePlan: (tradePlanId: string) =>
    apiRequest<BrokerOrder>("/broker/orders/from-trade-plan", { method: "POST", body: { tradePlanId } }),
  leanStatus: () => apiRequest<LeanEngineStatus>("/lean/status"),
  leanJobs: () => apiRequest<LeanJob[]>("/lean/jobs"),
  runLeanBacktest: (body: { startDate: string; endDate: string; initialCash?: number; benchmark?: string; symbols?: string[] }) =>
    apiRequest<LeanJob>("/lean/backtests", { method: "POST", body }),
  startLeanPaper: (body: { initialCash?: number; symbols?: string[] }) =>
    apiRequest<LeanJob>("/lean/paper/start", { method: "POST", body }),
  stopLeanJob: (id: string) => apiRequest<LeanJob>(`/lean/jobs/${id}/stop`, { method: "POST", body: {} })
};

export function parseSources(report?: ResearchReport | null) {
  if (!report) return [];
  try {
    return JSON.parse(report.sourcesJson) as Array<{ title: string; url: string }>;
  } catch {
    return [];
  }
}
