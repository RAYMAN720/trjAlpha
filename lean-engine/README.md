# TradePilot LEAN Engine

This directory adds one C# algorithm to the full official QuantConnect LEAN Docker engine.

```bash
docker build -t tradepilot-lean-engine:latest ./lean-engine
```

Files:

- `TradePilot.Algorithm/TradePilotLeanAlgorithm.cs` — shared backtest/paper algorithm
- `config/backtest.template.json` — local historical engine configuration
- `config/paper.template.json` — Alpaca paper configuration
- `Dockerfile` — compiles the algorithm and layers it onto `quantconnect/lean:latest`
- `LICENSE-APACHE-2.0.txt` — upstream dependency license

The build requires internet access to pull the official image and NuGet packages. Historical datasets and credentials are intentionally not included.
