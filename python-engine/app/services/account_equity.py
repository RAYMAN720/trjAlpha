from app.models.request_models import AccountEquityRequest
from app.models.response_models import AccountEquityResponse
from app.utils.validation import safe_div


def calculate_account_equity(request: AccountEquityRequest) -> AccountEquityResponse:
    open_value = sum(position.currentPrice * position.quantity for position in request.positions if position.status.lower() == "open")
    unrealized = sum((position.currentPrice - position.entryPrice) * position.quantity for position in request.positions if position.status.lower() == "open")
    equity = request.cashBalance + open_value + request.realizedPnL
    total_return = safe_div(equity - request.startingBalance, request.startingBalance) * 100
    drawdown = max(0, safe_div(request.startingBalance - equity, request.startingBalance) * 100)
    return AccountEquityResponse(
        startingBalance=request.startingBalance,
        cashBalance=request.cashBalance,
        openPositionsValue=round(open_value, 2),
        unrealizedPnL=round(unrealized, 2),
        realizedPnL=round(request.realizedPnL, 2),
        totalEquity=round(equity, 2),
        totalReturnPercent=round(total_return, 2),
        drawdown=round(drawdown, 2),
    )
