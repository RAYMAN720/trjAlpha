def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return max(minimum, min(maximum, value))


def safe_div(numerator: float, denominator: float, default: float = 0) -> float:
    return numerator / denominator if denominator else default


def round_price(value: float) -> float:
    return round(value, 6 if abs(value) < 1 else 2)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0
    sorted_values = sorted(values)
    index = int(clamp(pct, 0, 1) * (len(sorted_values) - 1))
    return sorted_values[index]
