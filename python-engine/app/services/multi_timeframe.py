from app.models.request_models import AnalysisRequest, MultiTimeframeRequest
from app.models.response_models import MultiTimeframeResponse
from app.services.indicators import analyze_technical


def _frame_trend(result):
    return result.trend


def analyze_multi_timeframe(request: MultiTimeframeRequest) -> MultiTimeframeResponse:
    analyzed = {
        timeframe: analyze_technical(
            AnalysisRequest(
                symbol=request.symbol,
                assetType=request.assetType,
                candles=candles,
                currentPrice=candles[-1].close if candles else None,
            )
        )
        for timeframe, candles in request.timeframes.items()
    }

    ordered = list(analyzed.items())
    if not ordered:
        return MultiTimeframeResponse(
            shortTermTrend="neutral",
            mediumTermTrend="neutral",
            dailyTrend="neutral",
            alignment="mixed",
            score=0,
            warning="No timeframe data was supplied.",
            timeframes={},
        )

    bullish = sum(1 for _, result in ordered if result.trend == "bullish")
    bearish = sum(1 for _, result in ordered if result.trend == "bearish")
    alignment = "aligned" if bullish == len(ordered) or bearish == len(ordered) else "conflicting" if bullish and bearish else "mixed"
    daily = analyzed.get("1d") or analyzed.get("daily") or ordered[-1][1]
    score = sum(result.technicalScore for _, result in ordered) / max(1, len(ordered))
    if alignment == "aligned":
        score += 6
    if daily.trend == "bearish":
        score -= 10

    warning = None
    if alignment == "conflicting":
        warning = "Timeframes conflict; only conservative paper-trade sizing is allowed."
    elif daily.trend == "bearish":
        warning = "Daily trend is bearish; confidence is reduced."

    return MultiTimeframeResponse(
        shortTermTrend=_frame_trend(ordered[0][1]),
        mediumTermTrend=_frame_trend(ordered[min(2, len(ordered) - 1)][1]),
        dailyTrend=daily.trend,
        alignment=alignment,
        score=round(max(0, min(100, score)), 2),
        warning=warning,
        timeframes=analyzed,
    )
