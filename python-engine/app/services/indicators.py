from statistics import mean

from app.models.request_models import AnalysisRequest, Candle
from app.models.response_models import TechnicalAnalysisResponse
from app.utils.validation import clamp, round_price, safe_div


def _sma(values: list[float], period: int) -> float:
    if not values:
        return 0
    return mean(values[-period:]) if len(values) >= period else mean(values)


def _ema(values: list[float], period: int) -> float:
    if not values:
        return 0
    multiplier = 2 / (period + 1)
    ema = values[0]
    for value in values[1:]:
        ema = (value - ema) * multiplier + ema
    return ema


def _rsi(values: list[float], period: int = 14) -> float:
    if len(values) < 2:
        return 50
    changes = [values[index] - values[index - 1] for index in range(1, len(values))]
    gains = [max(change, 0) for change in changes[-period:]]
    losses = [abs(min(change, 0)) for change in changes[-period:]]
    avg_gain = mean(gains) if gains else 0
    avg_loss = mean(losses) if losses else 0
    if avg_loss == 0:
        return 100 if avg_gain > 0 else 50
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _atr(candles: list[Candle], period: int = 14) -> float:
    if not candles:
        return 0
    ranges: list[float] = []
    previous_close = candles[0].close
    for candle in candles[-period:]:
        ranges.append(max(candle.high - candle.low, abs(candle.high - previous_close), abs(candle.low - previous_close)))
        previous_close = candle.close
    return mean(ranges) if ranges else 0


def analyze_technical(request: AnalysisRequest) -> TechnicalAnalysisResponse:
    candles = request.candles[-240:]
    closes = [candle.close for candle in candles]
    volumes = [candle.volume for candle in candles]
    current_price = request.currentPrice or (closes[-1] if closes else 0)

    if not candles or current_price <= 0:
        return TechnicalAnalysisResponse(
            trend="neutral",
            technicalScore=0,
            rsi=50,
            macdSignal="neutral",
            volumeConfirmation=False,
            support=0,
            resistance=0,
            volatilityRegime="normal",
            warnings=["Insufficient candle data; TypeScript fallback should remain available."],
            indicators={},
        )

    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    ema9 = _ema(closes[-30:], 9)
    macd = ema12 - ema26
    macd_signal = "bullish" if macd > ema9 * 0.001 else "bearish" if macd < -ema9 * 0.001 else "neutral"
    rsi = _rsi(closes)
    atr = _atr(candles)
    avg_volume = _sma(volumes, 20)
    relative_volume = request.relativeVolume or safe_div(volumes[-1] if volumes else 0, avg_volume, 1)
    support = min(candle.low for candle in candles[-20:])
    resistance = max(candle.high for candle in candles[-20:])
    daily_change = request.dailyChangePercent if request.dailyChangePercent is not None else safe_div(current_price - closes[0], closes[0]) * 100

    trend_votes = 0
    trend_votes += 1 if current_price >= sma20 else -1
    trend_votes += 1 if sma20 >= sma50 else -1
    trend_votes += 1 if sma50 >= sma200 else -1 if len(closes) >= 200 else 0
    trend_votes += 1 if macd_signal == "bullish" else -1 if macd_signal == "bearish" else 0
    trend = "bullish" if trend_votes >= 2 else "bearish" if trend_votes <= -2 else "neutral"

    volume_confirmation = relative_volume >= 1.15
    volatility_percent = safe_div(atr, current_price) * 100
    volatility_regime = "high" if volatility_percent >= 5 else "low" if volatility_percent <= 1 else "normal"

    score = 50
    score += 14 if trend == "bullish" else -14 if trend == "bearish" else 0
    score += 10 if volume_confirmation else -4
    score += 8 if 45 <= rsi <= 68 else 5 if 30 <= rsi < 45 else -10 if rsi > 78 else -4
    score += 8 if daily_change > 1 else -8 if daily_change < -3 else 0
    score -= 10 if volatility_regime == "high" and request.assetType == "crypto" else 0

    warnings: list[str] = []
    if daily_change >= 25:
        warnings.append("Price is extended more than 25% in one day; risk engine should block new paper entries.")
    if relative_volume < 0.8:
        warnings.append("Relative volume is low, reducing signal quality.")
    if rsi > 78:
        warnings.append("RSI is extended; avoid chasing vertical moves.")

    return TechnicalAnalysisResponse(
        trend=trend,
        technicalScore=round(clamp(score), 2),
        rsi=round(rsi, 2),
        macdSignal=macd_signal,
        volumeConfirmation=volume_confirmation,
        support=round_price(support),
        resistance=round_price(resistance),
        volatilityRegime=volatility_regime,
        warnings=warnings,
        indicators={
            "sma20": round_price(sma20),
            "sma50": round_price(sma50),
            "sma200": round_price(sma200),
            "ema12": round_price(ema12),
            "ema26": round_price(ema26),
            "macd": round_price(macd),
            "atr": round_price(atr),
            "relativeVolume": round(relative_volume, 2),
            "dailyChangePercent": round(daily_change, 2),
        },
    )
