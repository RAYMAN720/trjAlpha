from pydantic import BaseModel, Field
from typing import Literal, Any


Trend = Literal["bullish", "bearish", "neutral"]


class TechnicalAnalysisResponse(BaseModel):
    trend: Trend
    technicalScore: float
    rsi: float
    macdSignal: Trend
    volumeConfirmation: bool
    support: float
    resistance: float
    volatilityRegime: Literal["low", "normal", "high"]
    warnings: list[str] = Field(default_factory=list)
    indicators: dict[str, Any] = Field(default_factory=dict)
    paperTradingOnly: bool = True
    realTradingEnabled: bool = False


class MultiTimeframeResponse(BaseModel):
    shortTermTrend: Trend
    mediumTermTrend: Trend
    dailyTrend: Trend
    alignment: Literal["aligned", "mixed", "conflicting"]
    score: float
    warning: str | None = None
    timeframes: dict[str, TechnicalAnalysisResponse] = Field(default_factory=dict)
    fallbackSafe: bool = True


class BacktestResponse(BaseModel):
    totalTrades: int
    winRate: float
    profitFactor: float
    maxDrawdown: float
    averageWin: float
    averageLoss: float
    expectancy: float
    finalBalance: float
    equityCurve: list[dict[str, float | str]] = Field(default_factory=list)
    tradeList: list[dict[str, Any]] = Field(default_factory=list)
    strategyRating: str
    proven: bool
    paperTradingOnly: bool = True


class RiskCheckResponse(BaseModel):
    approved: bool
    riskState: Literal["NORMAL", "CAUTION", "REDUCED_SIZE", "PAUSED", "LOCKED"]
    positionSize: float
    maxLoss: float
    riskReward: float
    warnings: list[str] = Field(default_factory=list)
    blockingReasons: list[str] = Field(default_factory=list)
    paperTradingOnly: bool = True
    realTradingEnabled: bool = False


class NewsScoreResponse(BaseModel):
    sentiment: Literal["positive", "negative", "neutral", "mixed"]
    impactLevel: Literal["low", "medium", "high", "critical"]
    catalystType: str
    scoreImpact: float
    confidence: float
    decision: Literal["NO_ACTION", "WATCH", "STRONG_WATCH", "PAPER_TRADE_CANDIDATE", "BLOCKED_BY_RISK"]
    riskWarning: str
    paperTradingOnly: bool = True


class PortfolioPerformanceResponse(BaseModel):
    totalTrades: int
    closedTrades: int
    winRate: float
    profitFactor: float
    averageWin: float
    averageLoss: float
    expectancy: float
    realizedPnL: float
    unrealizedPnL: float
    totalEquity: float
    maxDrawdown: float
    bestTrade: dict[str, Any] | None = None
    worstTrade: dict[str, Any] | None = None
    status: str


class AccountEquityResponse(BaseModel):
    startingBalance: float
    cashBalance: float
    openPositionsValue: float
    unrealizedPnL: float
    realizedPnL: float
    totalEquity: float
    totalReturnPercent: float
    drawdown: float


class TradeReviewResponse(BaseModel):
    decision: Literal["NO_ACTION", "AVOID", "WATCH", "PAPER_TRADE_CANDIDATE", "BLOCKED_BY_RISK"]
    confidence: float
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    checklist: list[dict[str, str]] = Field(default_factory=list)
    paperTradingOnly: bool = True
    realTradingEnabled: bool = False
