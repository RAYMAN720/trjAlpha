from app.config import settings
from app.models.request_models import RiskCheckRequest
from app.models.response_models import RiskCheckResponse
from app.utils.validation import safe_div


def check_risk(request: RiskCheckRequest) -> RiskCheckResponse:
    trade = request.candidateTrade
    blocking: list[str] = []
    warnings: list[str] = []

    if trade.leverage or trade.margin or trade.futures:
        blocking.append("Leverage, margin, and futures are disabled.")
    if trade.stopLoss is None:
        blocking.append("Stop-loss is required.")
    if trade.takeProfit is None:
        blocking.append("Take-profit is required.")
    if request.currentOpenTrades >= settings.max_open_trades:
        blocking.append("Maximum open paper trades exceeded.")
    if request.dailyLoss >= settings.max_daily_loss_percent:
        blocking.append("Daily loss limit reached.")
    if request.weeklyLoss >= settings.max_weekly_loss_percent:
        blocking.append("Weekly loss limit reached.")

    risk_per_share = trade.entryPrice - (trade.stopLoss or trade.entryPrice)
    reward_per_share = (trade.takeProfit or trade.entryPrice) - trade.entryPrice
    risk_reward = safe_div(reward_per_share, risk_per_share)
    if risk_reward < 2:
        blocking.append("Risk/reward ratio is below 2:1.")
    if request.sectorExposurePercent > 35:
        warnings.append("Sector concentration is elevated.")
    if request.narrativeExposurePercent > 35:
        warnings.append("Narrative concentration is elevated.")

    max_loss = request.accountBalance * 0.01
    quantity = safe_div(max_loss, max(0.01, risk_per_share))
    position_size = min(quantity * trade.entryPrice, request.availableCash)
    risk_state = "NORMAL"
    if blocking:
        risk_state = "LOCKED"
        position_size = 0
    elif request.currentDrawdown > 8:
        risk_state = "REDUCED_SIZE"
        position_size *= 0.5
        warnings.append("Drawdown is elevated; position size reduced.")
    elif warnings:
        risk_state = "CAUTION"

    return RiskCheckResponse(
        approved=not blocking,
        riskState=risk_state,
        positionSize=round(position_size, 2),
        maxLoss=round(max_loss if not blocking else 0, 2),
        riskReward=round(risk_reward, 2),
        warnings=warnings,
        blockingReasons=blocking,
    )
