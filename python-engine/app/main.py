from fastapi import FastAPI

from app.config import settings
from app.models.request_models import (
    AccountEquityRequest,
    AnalysisRequest,
    BacktestRequest,
    MultiTimeframeRequest,
    NewsScoreRequest,
    PortfolioPerformanceRequest,
    RiskCheckRequest,
    TradeReviewRequest,
)
from app.services.account_equity import calculate_account_equity
from app.services.backtester import run_backtest
from app.services.indicators import analyze_technical
from app.services.multi_timeframe import analyze_multi_timeframe
from app.services.news_score import score_news
from app.services.portfolio_analytics import analyze_portfolio
from app.services.risk_engine import check_risk
from app.services.strategy_score import review_trade

app = FastAPI(title=settings.service_name, version="1.0.0")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": settings.service_name,
        "environment": settings.environment,
        "paperTradingOnly": settings.paper_trading_only,
        "realTradingEnabled": settings.real_trading_enabled,
        "engines": {
            "indicators": "active",
            "multiTimeframe": "active",
            "backtesting": "active",
            "risk": "active",
            "news": "active",
            "portfolio": "active",
        },
    }


@app.post("/analyze/stock")
def analyze_stock(request: AnalysisRequest):
    return analyze_technical(request.model_copy(update={"assetType": "stock"}))


@app.post("/analyze/crypto")
def analyze_crypto(request: AnalysisRequest):
    return analyze_technical(request.model_copy(update={"assetType": "crypto"}))


@app.post("/analyze/multi-timeframe")
def analyze_multi(request: MultiTimeframeRequest):
    return analyze_multi_timeframe(request)


@app.post("/backtest/strategy")
def backtest_strategy(request: BacktestRequest):
    return run_backtest(request)


@app.post("/risk/check")
def risk_check(request: RiskCheckRequest):
    return check_risk(request)


@app.post("/news/score")
def news_score(request: NewsScoreRequest):
    return score_news(request)


@app.post("/portfolio/performance")
def portfolio_performance(request: PortfolioPerformanceRequest):
    return analyze_portfolio(request)


@app.post("/account/equity")
def account_equity(request: AccountEquityRequest):
    return calculate_account_equity(request)


@app.post("/trade/review")
def trade_review(request: TradeReviewRequest):
    return review_trade(request)
