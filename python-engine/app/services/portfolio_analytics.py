from app.models.request_models import PortfolioPerformanceRequest
from app.models.response_models import PortfolioPerformanceResponse
from app.utils.validation import safe_div


def analyze_portfolio(request: PortfolioPerformanceRequest) -> PortfolioPerformanceResponse:
    trades = request.trades
    closed = [trade for trade in trades if trade.status.lower() != "open"]
    open_trades = [trade for trade in trades if trade.status.lower() == "open"]
    realized = sum(trade.realizedPnL for trade in closed)
    unrealized = sum((trade.currentPrice - trade.entryPrice) * trade.quantity for trade in open_trades)
    wins = [trade.realizedPnL for trade in closed if trade.realizedPnL > 0]
    losses = [abs(trade.realizedPnL) for trade in closed if trade.realizedPnL < 0]
    average_win = safe_div(sum(wins), len(wins))
    average_loss = safe_div(sum(losses), len(losses))
    profit_factor = safe_div(sum(wins), sum(losses), 999 if wins else 0)
    win_rate = safe_div(len(wins), len(closed)) * 100
    equity = request.startingBalance + realized + unrealized
    drawdown = max(0, safe_div(request.startingBalance - equity, request.startingBalance) * 100)

    best = max(closed, key=lambda trade: trade.realizedPnL, default=None)
    worst = min(closed, key=lambda trade: trade.realizedPnL, default=None)

    return PortfolioPerformanceResponse(
        totalTrades=len(trades),
        closedTrades=len(closed),
        winRate=round(win_rate, 2),
        profitFactor=round(profit_factor, 2),
        averageWin=round(average_win, 2),
        averageLoss=round(average_loss, 2),
        expectancy=round(safe_div(realized, len(closed)), 2),
        realizedPnL=round(realized, 2),
        unrealizedPnL=round(unrealized, 2),
        totalEquity=round(equity, 2),
        maxDrawdown=round(drawdown, 2),
        bestTrade=best.model_dump() if best else None,
        worstTrade=worst.model_dump() if worst else None,
        status="healthy" if profit_factor >= 1.2 and drawdown < 10 else "needs_review",
    )
