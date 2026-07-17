using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;
using QuantConnect.Data.Market;
using QuantConnect.Orders;
using QuantConnect.Securities;

namespace TradePilot.Lean;

/// <summary>
/// TradePilot's single-source-of-truth LEAN strategy.
/// The exact same event-driven C# algorithm is used for historical backtests and
/// Alpaca paper trading. Live-money configuration is blocked by the gateway.
/// </summary>
public sealed class TradePilotLeanAlgorithm : QCAlgorithm
{
    private readonly Dictionary<Symbol, PositionState> _positions = new();
    private readonly Dictionary<int, Symbol> _orderSymbols = new();
    private readonly HashSet<Symbol> _universe = new();
    private Symbol _benchmark = null!;
    private decimal _peakEquity;
    private decimal _startOfDayEquity;
    private DateTime _lastSignalDate = DateTime.MinValue;

    private decimal _riskPerTrade = 0.01m;
    private decimal _maxPortfolioDrawdown = 0.08m;
    private decimal _maxDailyLoss = 0.03m;
    private int _maxOpenPositions = 3;
    private int _breakoutLookback = 20;
    private int _maxHoldingDays = 20;
    private int _minimumScore = 85;

    public override void Initialize()
    {
        SetTimeZone(TimeZones.NewYork);
        if (!LiveMode)
        {
            SetStartDate(ReadDateParameter("start-date", new DateTime(2016, 1, 1)));
            SetEndDate(ReadDateParameter("end-date", DateTime.UtcNow.Date.AddDays(-1)));
            SetCash(ReadDecimalParameter("initial-cash", 100_000m));
        }
        SetBrokerageModel(BrokerageName.Alpaca, AccountType.Cash);

        _riskPerTrade = Math.Clamp(ReadDecimalParameter("risk-per-trade", 0.01m), 0.001m, 0.03m);
        _maxPortfolioDrawdown = Math.Clamp(ReadDecimalParameter("max-portfolio-drawdown", 0.08m), 0.02m, 0.25m);
        _maxDailyLoss = Math.Clamp(ReadDecimalParameter("max-daily-loss", 0.03m), 0.005m, 0.10m);
        _maxOpenPositions = Math.Clamp(ReadIntParameter("max-open-positions", 3), 1, 20);
        _breakoutLookback = Math.Clamp(ReadIntParameter("breakout-lookback", 20), 10, 100);
        _maxHoldingDays = Math.Clamp(ReadIntParameter("max-holding-days", 20), 1, 250);
        _minimumScore = Math.Clamp(ReadIntParameter("minimum-score", 85), 80, 100);

        _benchmark = AddEquity(GetParameter("benchmark") ?? "SPY", Resolution.Minute).Symbol;
        SetBenchmark(_benchmark);

        foreach (var ticker in ReadSymbols())
        {
            var symbol = AddEquity(ticker, Resolution.Minute).Symbol;
            if (symbol != _benchmark) _universe.Add(symbol);
        }

        _peakEquity = Portfolio.TotalPortfolioValue;
        _startOfDayEquity = Portfolio.TotalPortfolioValue;

        Schedule.On(DateRules.EveryDay(_benchmark), TimeRules.AfterMarketOpen(_benchmark, 1), () =>
        {
            _startOfDayEquity = Portfolio.TotalPortfolioValue;
        });

        Schedule.On(DateRules.EveryDay(_benchmark), TimeRules.AfterMarketOpen(_benchmark, 30), EvaluateEntries);
        Schedule.On(DateRules.EveryDay(_benchmark), TimeRules.BeforeMarketClose(_benchmark, 10), ManageEndOfDayRisk);
    }

    public override void OnData(Slice data)
    {
        _peakEquity = Math.Max(_peakEquity, Portfolio.TotalPortfolioValue);
        ManageOpenPositions(data);

        if (Portfolio.TotalPortfolioValue <= _peakEquity * (1m - _maxPortfolioDrawdown))
        {
            foreach (var symbol in _positions.Keys.ToArray()) ExitPosition(symbol, "Portfolio drawdown circuit breaker");
            Quit("Maximum portfolio drawdown reached.");
        }
    }

    public override void OnOrderEvent(OrderEvent orderEvent)
    {
        if (!_orderSymbols.TryGetValue(orderEvent.OrderId, out var symbol)) return;
        if (!_positions.TryGetValue(symbol, out var state)) return;

        if (state.EntryTicket?.OrderId == orderEvent.OrderId)
        {
            ProcessEntryEvent(symbol, state, orderEvent);
            return;
        }

        if (state.StopTicket?.OrderId == orderEvent.OrderId || state.TargetTicket?.OrderId == orderEvent.OrderId)
        {
            if (orderEvent.Status is OrderStatus.PartiallyFilled or OrderStatus.Filled)
            {
                state.Closing = true;
                CancelIfOpen(state.EntryTicket, "Protective order received a fill");

                var isStop = state.StopTicket?.OrderId == orderEvent.OrderId;
                var filledProtection = isStop ? state.StopTicket : state.TargetTicket;
                var sibling = isStop ? state.TargetTicket : state.StopTicket;
                CancelIfOpen(sibling, "Sibling protective order received a fill");

                if (orderEvent.Status == OrderStatus.PartiallyFilled && Portfolio[symbol].Quantity != 0)
                {
                    // Cancel the unfilled protective remainder and flatten immediately. This avoids
                    // two independent exit orders selling more shares than remain after a partial fill.
                    CancelIfOpen(filledProtection, "Flatten remainder after partial protective fill");
                    state.ExitTicket = MarketOrder(symbol, -Portfolio[symbol].Quantity, true, "Flatten partial protective fill remainder");
                    _orderSymbols[state.ExitTicket.OrderId] = symbol;
                }
                else if (Portfolio[symbol].Quantity == 0)
                {
                    ForgetPosition(symbol, state);
                }
            }
            return;
        }

        if (state.ExitTicket?.OrderId == orderEvent.OrderId)
        {
            if (orderEvent.Status == OrderStatus.Filled)
            {
                if (Portfolio[symbol].Quantity == 0)
                {
                    ForgetPosition(symbol, state);
                }
                else
                {
                    // Defensive recovery for an unexpected residual quantity.
                    state.ExitTicket = null;
                    state.Closing = false;
                    SubmitOrResizeProtectiveOrders(symbol, state);
                }
            }
            else if (orderEvent.Status is OrderStatus.Canceled or OrderStatus.Invalid)
            {
                state.ExitTicket = null;
                state.Closing = false;
                if (Portfolio[symbol].Quantity != 0)
                {
                    state.FilledQuantity = Math.Abs(Portfolio[symbol].Quantity);
                    SubmitOrResizeProtectiveOrders(symbol, state);
                }
                else
                {
                    ForgetPosition(symbol, state);
                }

                Error($"Exit order {orderEvent.OrderId} for {symbol} ended as {orderEvent.Status}: {orderEvent.Message}");
            }
        }
    }

    private void ProcessEntryEvent(Symbol symbol, PositionState state, OrderEvent orderEvent)
    {
        if (orderEvent.Status is OrderStatus.PartiallyFilled or OrderStatus.Filled)
        {
            var fillQuantity = Math.Abs(orderEvent.FillQuantity);
            if (fillQuantity > 0)
            {
                var previousValue = state.AverageEntryPrice * state.FilledQuantity;
                state.FilledQuantity += fillQuantity;
                state.AverageEntryPrice = (previousValue + orderEvent.FillPrice * fillQuantity) / state.FilledQuantity;
                state.EntryPrice = state.AverageEntryPrice;
                state.InitialRiskPerShare = Math.Max(0.01m, state.AverageEntryPrice - state.StopPrice);
                state.TargetPrice = state.AverageEntryPrice + state.InitialRiskPerShare * 2.5m;
                state.HighestPrice = Math.Max(state.HighestPrice, orderEvent.FillPrice);
                SubmitOrResizeProtectiveOrders(symbol, state);
            }
        }

        if (orderEvent.Status == OrderStatus.Filled)
        {
            SubmitOrResizeProtectiveOrders(symbol, state);
        }
        else if (orderEvent.Status is OrderStatus.Canceled or OrderStatus.Invalid)
        {
            if (state.FilledQuantity > 0 && !state.Closing)
            {
                SubmitOrResizeProtectiveOrders(symbol, state);
            }
            else if (state.FilledQuantity <= 0)
            {
                ForgetPosition(symbol, state);
            }

            Debug($"Entry order {orderEvent.OrderId} for {symbol} ended as {orderEvent.Status}: {orderEvent.Message}");
        }
    }

    private void SubmitOrResizeProtectiveOrders(Symbol symbol, PositionState state)
    {
        if (state.Closing || state.FilledQuantity <= 0) return;

        var exitQuantity = -state.FilledQuantity;
        if (state.StopTicket is null)
        {
            state.StopTicket = StopMarketOrder(symbol, exitQuantity, state.StopPrice, $"Protective stop {state.StopPrice:F2}");
            _orderSymbols[state.StopTicket.OrderId] = symbol;
        }
        else if (state.StopTicket.Status is OrderStatus.New or OrderStatus.Submitted or OrderStatus.PartiallyFilled)
        {
            state.StopTicket.Update(new UpdateOrderFields
            {
                Quantity = exitQuantity,
                StopPrice = state.StopPrice,
                Tag = "Resize protective stop after entry fill"
            });
        }

        if (state.TargetTicket is null)
        {
            state.TargetTicket = LimitOrder(symbol, exitQuantity, state.TargetPrice, $"Profit target {state.TargetPrice:F2}");
            _orderSymbols[state.TargetTicket.OrderId] = symbol;
        }
        else if (state.TargetTicket.Status is OrderStatus.New or OrderStatus.Submitted or OrderStatus.PartiallyFilled)
        {
            state.TargetTicket.Update(new UpdateOrderFields
            {
                Quantity = exitQuantity,
                LimitPrice = state.TargetPrice,
                Tag = "Resize profit target after entry fill"
            });
        }
    }

    private void EvaluateEntries()
    {
        if (IsWarmingUp || Time.Date == _lastSignalDate.Date) return;
        _lastSignalDate = Time.Date;

        if (!CanOpenNewRisk() || !BenchmarkRegimeAllowsLongs()) return;

        foreach (var symbol in _universe)
        {
            if (_positions.Count >= _maxOpenPositions) break;
            if (Portfolio[symbol].Invested || _positions.ContainsKey(symbol)) continue;

            var setup = BuildSetup(symbol);
            if (setup is null || !setup.Passed) continue;

            var currentPrice = Securities[symbol].Price;
            if (currentPrice <= 0 || currentPrice > setup.BreakoutLevel + setup.Atr * 0.75m) continue;

            var riskBudget = Portfolio.TotalPortfolioValue * _riskPerTrade;
            var riskPerShare = currentPrice - setup.StopPrice;
            if (riskPerShare <= 0) continue;

            var quantity = Math.Floor(riskBudget / riskPerShare);
            var cashLimited = Math.Floor(Portfolio.CashBook.TotalValueInAccountCurrency * 0.25m / currentPrice);
            quantity = Math.Min(quantity, cashLimited);
            if (quantity < 1) continue;

            // Asynchronous submission ensures state is registered before LEAN emits fill events.
            var entry = MarketOrder(symbol, quantity, true, $"TrendBreakoutV2 score={setup.Score}");
            var state = new PositionState
            {
                EntryTicket = entry,
                EntryTime = Time,
                EntryPrice = currentPrice,
                AverageEntryPrice = currentPrice,
                InitialRiskPerShare = riskPerShare,
                HighestPrice = currentPrice,
                StopPrice = setup.StopPrice,
                TargetPrice = currentPrice + riskPerShare * 2.5m,
                RequestedQuantity = quantity
            };

            _positions[symbol] = state;
            _orderSymbols[entry.OrderId] = symbol;
        }
    }

    private void ManageOpenPositions(Slice data)
    {
        foreach (var (symbol, state) in _positions.ToArray())
        {
            if (!Portfolio[symbol].Invested || state.Closing) continue;

            // Defense in depth: every filled position must have broker-side protection.
            SubmitOrResizeProtectiveOrders(symbol, state);
            if (!data.Bars.TryGetValue(symbol, out var bar)) continue;

            state.HighestPrice = Math.Max(state.HighestPrice, bar.High);
            var openProfitPerShare = bar.Close - state.EntryPrice;
            var rMultiple = state.InitialRiskPerShare <= 0 ? 0 : openProfitPerShare / state.InitialRiskPerShare;

            if (rMultiple >= 1m && state.StopPrice < state.EntryPrice)
            {
                state.StopPrice = state.EntryPrice + state.InitialRiskPerShare * 0.10m;
                state.StopTicket?.Update(new UpdateOrderFields { StopPrice = state.StopPrice, Tag = "Move stop above breakeven" });
            }

            if (rMultiple >= 1.5m)
            {
                var trailingStop = state.HighestPrice - state.InitialRiskPerShare * 1.5m;
                if (trailingStop > state.StopPrice)
                {
                    state.StopPrice = trailingStop;
                    state.StopTicket?.Update(new UpdateOrderFields { StopPrice = trailingStop, Tag = "ATR-style trailing stop" });
                }
            }

            if ((Time.Date - state.EntryTime.Date).TotalDays >= _maxHoldingDays)
                ExitPosition(symbol, "Maximum holding period");
        }
    }

    private void ManageEndOfDayRisk()
    {
        foreach (var (symbol, state) in _positions.ToArray())
        {
            if (!Portfolio[symbol].Invested || state.Closing) continue;
            var history = History<TradeBar>(symbol, 25, Resolution.Daily).OrderBy(x => x.EndTime).ToList();
            if (history.Count < 21) continue;
            if (history[^1].Close < Ema(history.Select(x => x.Close).ToList(), 20))
                ExitPosition(symbol, "Daily close lost EMA20");
        }
    }

    private void ExitPosition(Symbol symbol, string reason)
    {
        if (!_positions.TryGetValue(symbol, out var state) || state.Closing || state.ExitTicket is not null) return;

        state.Closing = true;
        CancelIfOpen(state.EntryTicket, reason);
        CancelIfOpen(state.StopTicket, reason);
        CancelIfOpen(state.TargetTicket, reason);

        var quantity = Portfolio[symbol].Quantity;
        if (quantity == 0)
        {
            if (!IsOpen(state.EntryTicket)) ForgetPosition(symbol, state);
            return;
        }

        state.ExitTicket = MarketOrder(symbol, -quantity, true, reason);
        _orderSymbols[state.ExitTicket.OrderId] = symbol;
    }

    private void ForgetPosition(Symbol symbol, PositionState state)
    {
        foreach (var ticket in new[] { state.EntryTicket, state.StopTicket, state.TargetTicket, state.ExitTicket })
        {
            if (ticket is not null) _orderSymbols.Remove(ticket.OrderId);
        }
        _positions.Remove(symbol);
    }

    private static bool IsOpen(OrderTicket? ticket)
        => ticket?.Status is OrderStatus.New or OrderStatus.Submitted or OrderStatus.PartiallyFilled;

    private static void CancelIfOpen(OrderTicket? ticket, string reason)
    {
        if (IsOpen(ticket)) ticket!.Cancel(reason);
    }

    private bool CanOpenNewRisk()
    {
        var equity = Portfolio.TotalPortfolioValue;
        return equity > _startOfDayEquity * (1m - _maxDailyLoss)
            && equity > _peakEquity * (1m - _maxPortfolioDrawdown);
    }

    private bool BenchmarkRegimeAllowsLongs()
    {
        var history = History<TradeBar>(_benchmark, 220, Resolution.Daily).OrderBy(x => x.EndTime).ToList();
        if (history.Count < 205) return false;
        var closes = history.Select(x => x.Close).ToList();
        var close = closes[^1];
        var sma50 = closes.TakeLast(50).Average();
        var sma200 = closes.TakeLast(200).Average();
        var return20 = close / closes[^21] - 1m;
        return close > sma200 && sma50 > sma200 && return20 > -0.05m;
    }

    private Setup? BuildSetup(Symbol symbol)
    {
        var history = History<TradeBar>(symbol, 260, Resolution.Daily).OrderBy(x => x.EndTime).ToList();
        var benchmark = History<TradeBar>(_benchmark, 80, Resolution.Daily).OrderBy(x => x.EndTime).ToList();
        if (history.Count < 220 || benchmark.Count < 65) return null;

        var closes = history.Select(x => x.Close).ToList();
        var volumes = history.Select(x => (decimal)x.Volume).ToList();
        var latest = history[^1];
        var previous = history[^2];
        var ema20 = Ema(closes, 20);
        var ema20Prior = Ema(closes.Take(closes.Count - 5).ToList(), 20);
        var ema50 = Ema(closes, 50);
        var sma200 = closes.TakeLast(200).Average();
        var previousHigh20 = history.Skip(history.Count - _breakoutLookback - 1).Take(_breakoutLookback).Max(x => x.High);
        var averageVolume20 = volumes.Skip(volumes.Count - 21).Take(20).Average();
        var relativeVolume = averageVolume20 <= 0 ? 0 : (decimal)latest.Volume / averageVolume20;
        var atr14 = Atr(history, 14);
        var atrPercent = latest.Close <= 0 ? 0 : atr14 / latest.Close;
        var rsi14 = Rsi(closes, 14);
        var stockReturn60 = latest.Close / history[^61].Close - 1m;
        var benchmarkReturn60 = benchmark[^1].Close / benchmark[^61].Close - 1m;
        var relativeStrength = stockReturn60 - benchmarkReturn60;
        var dollarVolume = latest.Close * averageVolume20;
        var candleRange = Math.Max(0.01m, latest.High - latest.Low);
        var closeLocation = (latest.Close - latest.Low) / candleRange;
        var extension = latest.Close - previousHigh20;

        var score = 0;
        var liquid = latest.Close >= 10m && dollarVolume >= 50_000_000m;
        var trend = latest.Close > ema20 && ema20 > ema50 && ema50 > sma200 && ema20 > ema20Prior;
        var breakout = latest.Close > previousHigh20 && previous.Close <= previousHigh20;
        var volume = relativeVolume >= 1.35m;
        var rs = relativeStrength >= 0.03m;
        var volatility = atrPercent is >= 0.01m and <= 0.06m;
        var momentum = rsi14 is >= 52m and <= 72m;
        var candle = closeLocation >= 0.65m;
        var notExtended = extension <= atr14 * 0.75m;

        if (liquid) score += 10;
        if (trend) score += 25;
        if (breakout) score += 20;
        if (volume) score += 15;
        if (rs) score += 10;
        if (volatility) score += 5;
        if (momentum) score += 5;
        if (candle) score += 5;
        if (notExtended) score += 5;

        // Liquidity, trend, breakout confirmation, volume and entry extension are mandatory.
        // Relative strength, volatility, momentum and candle quality contribute to the score,
        // allowing the configured threshold to express how selective the strategy should be.
        var passed = liquid && trend && breakout && volume && notExtended && score >= _minimumScore;
        var stop = Math.Min(latest.Close - atr14 * 1.5m, previousHigh20 - atr14 * 0.25m);
        var risk = latest.Close - stop;
        if (risk <= 0) return null;

        return new Setup
        {
            Passed = passed,
            Score = score,
            StopPrice = stop,
            BreakoutLevel = previousHigh20,
            Atr = atr14
        };
    }

    private IEnumerable<string> ReadSymbols()
    {
        var raw = GetParameter("symbols");
        if (string.IsNullOrWhiteSpace(raw))
            raw = "AAPL,MSFT,NVDA,AMZN,META,GOOGL,AVGO,AMD,TSLA,JPM,V,MA,COST,LLY,UNH,XOM";

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.ToUpperInvariant())
            .Distinct();
    }

    private DateTime ReadDateParameter(string name, DateTime fallback)
        => DateTime.TryParse(GetParameter(name), out var value) ? value : fallback;

    private decimal ReadDecimalParameter(string name, decimal fallback)
        => decimal.TryParse(GetParameter(name), out var value) ? value : fallback;

    private int ReadIntParameter(string name, int fallback)
        => int.TryParse(GetParameter(name), out var value) ? value : fallback;

    private static decimal Ema(IReadOnlyList<decimal> values, int period)
    {
        if (values.Count < period) return 0;
        var multiplier = 2m / (period + 1m);
        var ema = values.Take(period).Average();
        for (var i = period; i < values.Count; i++) ema = (values[i] - ema) * multiplier + ema;
        return ema;
    }

    private static decimal Atr(IReadOnlyList<TradeBar> bars, int period)
    {
        if (bars.Count < period + 1) return 0;
        var ranges = new List<decimal>();
        for (var i = bars.Count - period; i < bars.Count; i++)
        {
            var current = bars[i];
            var previousClose = bars[i - 1].Close;
            ranges.Add(Math.Max(current.High - current.Low, Math.Max(Math.Abs(current.High - previousClose), Math.Abs(current.Low - previousClose))));
        }
        return ranges.Average();
    }

    private static decimal Rsi(IReadOnlyList<decimal> values, int period)
    {
        if (values.Count < period + 1) return 50m;
        decimal gains = 0;
        decimal losses = 0;
        for (var i = values.Count - period; i < values.Count; i++)
        {
            var change = values[i] - values[i - 1];
            if (change >= 0) gains += change; else losses -= change;
        }
        if (losses == 0) return 100m;
        var rs = gains / losses;
        return 100m - 100m / (1m + rs);
    }

    private sealed class Setup
    {
        public bool Passed { get; init; }
        public int Score { get; init; }
        public decimal StopPrice { get; init; }
        public decimal BreakoutLevel { get; init; }
        public decimal Atr { get; init; }
    }

    private sealed class PositionState
    {
        public OrderTicket? EntryTicket { get; init; }
        public OrderTicket? StopTicket { get; set; }
        public OrderTicket? TargetTicket { get; set; }
        public OrderTicket? ExitTicket { get; set; }
        public DateTime EntryTime { get; init; }
        public decimal EntryPrice { get; set; }
        public decimal AverageEntryPrice { get; set; }
        public decimal InitialRiskPerShare { get; set; }
        public decimal HighestPrice { get; set; }
        public decimal StopPrice { get; set; }
        public decimal TargetPrice { get; set; }
        public decimal RequestedQuantity { get; init; }
        public decimal FilledQuantity { get; set; }
        public bool Closing { get; set; }
    }
}
