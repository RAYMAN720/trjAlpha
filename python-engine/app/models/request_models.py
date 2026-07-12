from pydantic import BaseModel, Field
from typing import Literal


AssetType = Literal["stock", "crypto"]
Trend = Literal["bullish", "bearish", "neutral"]


class Candle(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class AnalysisRequest(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    candles: list[Candle] = Field(default_factory=list)
    currentPrice: float | None = None
    relativeVolume: float | None = None
    dailyChangePercent: float | None = None


class MultiTimeframeRequest(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    timeframes: dict[str, list[Candle]] = Field(default_factory=dict)


class BacktestRequest(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    candles: list[Candle] = Field(default_factory=list)
    strategyName: str
    startingBalance: float = 500
    riskPerTrade: float = 0.01
    stopLossMethod: str = "atr"
    takeProfitMethod: str = "2r"
    fees: float = 0
    slippage: float = 0


class CandidateTrade(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    entryPrice: float
    stopLoss: float | None = None
    takeProfit: float | None = None
    sector: str | None = None
    narrative: str | None = None
    leverage: bool = False
    margin: bool = False
    futures: bool = False


class RiskCheckRequest(BaseModel):
    accountBalance: float = 500
    availableCash: float = 500
    currentOpenTrades: int = 0
    candidateTrade: CandidateTrade
    currentDrawdown: float = 0
    dailyLoss: float = 0
    weeklyLoss: float = 0
    sectorExposurePercent: float = 0
    narrativeExposurePercent: float = 0


class NewsScoreRequest(BaseModel):
    title: str
    summary: str = ""
    source: str = "unknown"
    publishedTime: str | None = None
    symbol: str
    assetType: AssetType = "stock"
    currentPriceMovement: float = 0
    volumeMovement: float = 1
    duplicated: bool = False


class PortfolioTrade(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    entryPrice: float
    currentPrice: float
    quantity: float
    status: str = "Open"
    exitPrice: float | None = None
    realizedPnL: float = 0
    openedAt: str | None = None
    closedAt: str | None = None
    strategyName: str = "Unclassified"


class PortfolioPerformanceRequest(BaseModel):
    startingBalance: float = 500
    trades: list[PortfolioTrade] = Field(default_factory=list)


class AccountEquityRequest(BaseModel):
    startingBalance: float = 500
    cashBalance: float = 500
    positions: list[PortfolioTrade] = Field(default_factory=list)
    realizedPnL: float = 0


class TradeReviewRequest(BaseModel):
    symbol: str
    assetType: AssetType = "stock"
    entryPrice: float
    currentPrice: float
    stopLoss: float | None = None
    takeProfit: float | None = None
    strategyName: str = "Unclassified"
    technicalScore: float = 0
    newsScoreImpact: float = 0
    riskApproved: bool = False
