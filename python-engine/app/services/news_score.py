from app.models.request_models import NewsScoreRequest
from app.models.response_models import NewsScoreResponse
from app.utils.validation import clamp


POSITIVE_WORDS = {"beat", "approval", "partnership", "upgrade", "surge", "record", "profit", "launch", "growth"}
NEGATIVE_WORDS = {"lawsuit", "downgrade", "miss", "fraud", "probe", "halt", "bankruptcy", "loss", "delay"}


def score_news(request: NewsScoreRequest) -> NewsScoreResponse:
    text = f"{request.title} {request.summary}".lower()
    positives = sum(1 for word in POSITIVE_WORDS if word in text)
    negatives = sum(1 for word in NEGATIVE_WORDS if word in text)
    raw_score = (positives - negatives) * 8
    if request.duplicated:
        raw_score -= 10
    if request.volumeMovement > 2:
        raw_score += 6
    if abs(request.currentPriceMovement) > 10:
        raw_score -= 4

    sentiment = "positive" if raw_score > 8 else "negative" if raw_score < -8 else "mixed" if positives and negatives else "neutral"
    impact = abs(raw_score)
    impact_level = "critical" if impact >= 28 else "high" if impact >= 18 else "medium" if impact >= 8 else "low"
    decision = "NO_ACTION"
    if raw_score >= 24 and request.volumeMovement >= 1.5:
        decision = "PAPER_TRADE_CANDIDATE"
    elif raw_score >= 12:
        decision = "STRONG_WATCH"
    elif raw_score >= 4:
        decision = "WATCH"
    if request.currentPriceMovement >= 25:
        decision = "BLOCKED_BY_RISK"

    return NewsScoreResponse(
        sentiment=sentiment,
        impactLevel=impact_level,
        catalystType="earnings_or_catalyst" if positives or negatives else "general_market_news",
        scoreImpact=round(clamp(raw_score, -40, 40), 2),
        confidence=round(clamp(55 + impact), 2),
        decision=decision,
        riskWarning="News alone cannot approve a trade; technical and risk engines must confirm.",
    )
