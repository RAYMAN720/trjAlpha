# TradePilot Python Analysis Engine

FastAPI microservice for deterministic market analysis used by the Node backend.

It provides:
- technical indicators and multi-timeframe alignment
- strategy backtesting
- paper-trade risk checks
- news scoring
- portfolio and account equity analytics

Safety:
- paper trading only
- real trading disabled
- no leverage, margin, or futures approval
- Node backend falls back to TypeScript analysis if this service is unavailable

Run locally:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

Health check:

```bash
curl http://127.0.0.1:8001/health
```
