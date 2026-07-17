import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { AgentActivityPage } from "./pages/AgentActivityPage";
import { AlertsCenterPage } from "./pages/AlertsCenterPage";
import { AutomationCenterPage } from "./pages/AutomationCenterPage";
import { BrokerCenterPage } from "./pages/BrokerCenterPage";
import { BenchmarkPage } from "./pages/BenchmarkPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomeOverviewPage } from "./pages/HomeOverviewPage";
import { JournalPage } from "./pages/JournalPage";
import { LearningDashboardPage } from "./pages/LearningDashboardPage";
import { LivePaperTradingPage } from "./pages/LivePaperTradingPage";
import { NewsPage } from "./pages/NewsPage";
import { PaperTradingPage } from "./pages/PaperTradingPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ProfessionalDeskPage } from "./pages/ProfessionalDeskPage";
import { ReportsCenterPage } from "./pages/ReportsCenterPage";
import { ScannerPage } from "./pages/ScannerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StockDetailPage } from "./pages/StockDetailPage";
import { StrategyPerformancePage } from "./pages/StrategyPerformancePage";
import { WatchlistPage } from "./pages/WatchlistPage";
import { WeeklyReportPage } from "./pages/WeeklyReportPage";
import { MarketModeProvider, MarketModeRoute } from "./lib/marketMode";

function StockRoutes({ children }: { children: JSX.Element }) {
  return <MarketModeRoute mode="stocks">{children}</MarketModeRoute>;
}

function CryptoRoutes({ children }: { children: JSX.Element }) {
  return <MarketModeRoute mode="crypto">{children}</MarketModeRoute>;
}

export default function App() {
  return (
    <MarketModeProvider>
      <AuthGate>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeOverviewPage />} />
            <Route path="/stocks" element={<StockRoutes><DashboardPage /></StockRoutes>} />
            <Route path="/stocks/scanner" element={<StockRoutes><ScannerPage /></StockRoutes>} />
            <Route path="/stocks/:ticker" element={<StockRoutes><StockDetailPage /></StockRoutes>} />
            <Route path="/stocks/paper-trading" element={<StockRoutes><PaperTradingPage /></StockRoutes>} />
            <Route path="/stocks/paper-trading/live" element={<StockRoutes><LivePaperTradingPage /></StockRoutes>} />
            <Route path="/stocks/portfolio" element={<StockRoutes><PortfolioPage /></StockRoutes>} />
            <Route path="/stocks/news" element={<StockRoutes><NewsPage /></StockRoutes>} />
            <Route path="/stocks/watchlist" element={<StockRoutes><WatchlistPage /></StockRoutes>} />
            <Route path="/stocks/learning" element={<StockRoutes><LearningDashboardPage /></StockRoutes>} />
            <Route path="/stocks/alerts" element={<StockRoutes><AlertsCenterPage /></StockRoutes>} />
            <Route path="/stocks/reports" element={<StockRoutes><ReportsCenterPage /></StockRoutes>} />
            <Route path="/crypto" element={<CryptoRoutes><DashboardPage /></CryptoRoutes>} />
            <Route path="/crypto/scanner" element={<CryptoRoutes><ScannerPage /></CryptoRoutes>} />
            <Route path="/crypto/:symbol" element={<CryptoRoutes><StockDetailPage /></CryptoRoutes>} />
            <Route path="/crypto/paper-trading" element={<CryptoRoutes><PaperTradingPage /></CryptoRoutes>} />
            <Route path="/crypto/paper-trading/live" element={<CryptoRoutes><LivePaperTradingPage /></CryptoRoutes>} />
            <Route path="/crypto/portfolio" element={<CryptoRoutes><PortfolioPage /></CryptoRoutes>} />
            <Route path="/crypto/news" element={<CryptoRoutes><NewsPage /></CryptoRoutes>} />
            <Route path="/crypto/watchlist" element={<CryptoRoutes><WatchlistPage /></CryptoRoutes>} />
            <Route path="/crypto/learning" element={<CryptoRoutes><LearningDashboardPage /></CryptoRoutes>} />
            <Route path="/crypto/alerts" element={<CryptoRoutes><AlertsCenterPage /></CryptoRoutes>} />
            <Route path="/crypto/reports" element={<CryptoRoutes><ReportsCenterPage /></CryptoRoutes>} />
            <Route path="/professional" element={<ProfessionalDeskPage />} />
            <Route path="/playbooks" element={<PlaybooksPage />} />
            <Route path="/strategy-lab" element={<PlaybooksPage />} />
            <Route path="/benchmark" element={<BenchmarkPage />} />
            <Route path="/reports/weekly" element={<WeeklyReportPage />} />
            <Route path="/scanner" element={<Navigate to="/stocks/scanner" replace />} />
            <Route path="/automation" element={<AutomationCenterPage />} />
            <Route path="/reports" element={<Navigate to="/stocks/reports" replace />} />
            <Route path="/agents" element={<AgentActivityPage />} />
            <Route path="/learning" element={<LearningDashboardPage />} />
            <Route path="/strategy" element={<StrategyPerformancePage />} />
            <Route path="/alerts" element={<Navigate to="/stocks/alerts" replace />} />
            <Route path="/broker" element={<BrokerCenterPage />} />
            <Route path="/watchlist" element={<Navigate to="/stocks/watchlist" replace />} />
            <Route path="/paper-trading" element={<Navigate to="/stocks/paper-trading" replace />} />
            <Route path="/paper-trading/live" element={<LivePaperTradingPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthGate>
    </MarketModeProvider>
  );
}
