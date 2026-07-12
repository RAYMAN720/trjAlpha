from app.models.request_models import TradeReviewRequest
from app.models.response_models import TradeReviewResponse


def review_trade(request: TradeReviewRequest) -> TradeReviewResponse:
    strengths: list[str] = []
    risks: list[str] = []
    checklist: list[dict[str, str]] = []

    if request.technicalScore >= 75:
        strengths.append("Technical score is above the professional paper-trade threshold.")
        checklist.append({"item": "Technical score above 75", "status": "pass"})
    else:
        risks.append("Technical score is below the preferred threshold.")
        checklist.append({"item": "Technical score above 75", "status": "fail"})

    if request.stopLoss and request.takeProfit:
        reward = request.takeProfit - request.entryPrice
        risk = request.entryPrice - request.stopLoss
        rr = reward / risk if risk > 0 else 0
        checklist.append({"item": "Stop-loss and take-profit present", "status": "pass"})
        if rr >= 2:
            strengths.append("Risk/reward is at least 2:1.")
            checklist.append({"item": "Risk/reward at least 2:1", "status": "pass"})
        else:
            risks.append("Risk/reward is below 2:1.")
            checklist.append({"item": "Risk/reward at least 2:1", "status": "fail"})
    else:
        risks.append("Trade lacks a complete stop-loss/take-profit plan.")
        checklist.append({"item": "Stop-loss and take-profit present", "status": "fail"})

    if request.riskApproved:
        checklist.append({"item": "Risk engine approved", "status": "pass"})
    else:
        risks.append("Risk engine did not approve this setup.")
        checklist.append({"item": "Risk engine approved", "status": "fail"})

    decision = "PAPER_TRADE_CANDIDATE" if request.technicalScore >= 75 and request.riskApproved and len(risks) <= 1 else "WATCH"
    if not request.riskApproved:
        decision = "BLOCKED_BY_RISK"
    if request.technicalScore < 45:
        decision = "AVOID"

    return TradeReviewResponse(
        decision=decision,
        confidence=round(min(95, max(10, request.technicalScore + request.newsScoreImpact)), 2),
        strengths=strengths,
        risks=risks,
        checklist=checklist,
    )
