from app.models.request_models import AnalysisRequest, BacktestRequest
from app.models.response_models import BacktestResponse
from app.services.indicators import analyze_technical
from app.utils.validation import safe_div


def run_backtest(request: BacktestRequest) -> BacktestResponse:
    balance = request.startingBalance
    equity_curve: list[dict[str, float | str]] = []
    trades: list[dict] = []
    peak = balance
    max_drawdown = 0.0
    candles = request.candles

    for index in range(30, len(candles) - 1):
        window = candles[: index + 1]
        analysis = analyze_technical(
            AnalysisRequest(symbol=request.symbol, assetType=request.assetType, candles=window, currentPrice=window[-1].close)
        )
        if analysis.technicalScore < 68 or analysis.trend != "bullish":
            continue

        entry = candles[index].close * (1 + request.slippage)
        atr = analysis.indicators.get("atr", entry * 0.03)
        stop = max(0.01, entry - atr * 1.5)
        target = entry + (entry - stop) * 2
        risk_amount = balance * request.riskPerTrade
        quantity = risk_amount / max(0.01, entry - stop)

        exit_price = candles[index + 1].close
        outcome = "time_exit"
        for future in candles[index + 1 : min(len(candles), index + 8)]:
            if future.low <= stop:
                exit_price = stop
                outcome = "stop_loss"
                break
            if future.high >= target:
                exit_price = target
                outcome = "take_profit"
                break

        pnl = (exit_price - entry) * quantity - request.fees
        balance += pnl
        peak = max(peak, balance)
        max_drawdown = max(max_drawdown, safe_div(peak - balance, peak) * 100)
        trades.append({"entry": round(entry, 4), "exit": round(exit_price, 4), "pnl": round(pnl, 2), "outcome": outcome, "time": candles[index].time})
        equity_curve.append({"time": candles[index].time, "equity": round(balance, 2)})

    wins = [trade["pnl"] for trade in trades if trade["pnl"] > 0]
    losses = [abs(trade["pnl"]) for trade in trades if trade["pnl"] < 0]
    average_win = safe_div(sum(wins), len(wins))
    average_loss = safe_div(sum(losses), len(losses))
    profit_factor = safe_div(sum(wins), sum(losses), 999 if wins else 0)
    win_rate = safe_div(len(wins), len(trades)) * 100
    expectancy = safe_div(sum(trade["pnl"] for trade in trades), len(trades))
    proven = len(trades) >= 30 and profit_factor >= 1.3 and max_drawdown <= 20 and average_win > average_loss

    return BacktestResponse(
        totalTrades=len(trades),
        winRate=round(win_rate, 2),
        profitFactor=round(profit_factor, 2),
        maxDrawdown=round(max_drawdown, 2),
        averageWin=round(average_win, 2),
        averageLoss=round(average_loss, 2),
        expectancy=round(expectancy, 2),
        finalBalance=round(balance, 2),
        equityCurve=equity_curve,
        tradeList=trades,
        strategyRating="Proven" if proven else "Needs more evidence",
        proven=proven,
    )
