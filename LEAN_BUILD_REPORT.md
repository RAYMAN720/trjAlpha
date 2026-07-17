# TradePilot LEAN Edition — Build Report

**Build date:** 17 July 2026  
**Release:** 3.0.0  
**Execution mode:** Backtesting and paper trading only

## 1. Result

TradePilot was rebuilt as a React/TypeScript product and safety layer around the complete official QuantConnect LEAN engine.

```text
React dashboard
  -> Node.js / Express / TypeScript API
  -> authenticated TradePilot LEAN Gateway
  -> official QuantConnect LEAN Docker engine
  -> historical backtest or Alpaca paper brokerage
```

The repository does not paste an unattributed copy of thousands of upstream LEAN source files into the Node.js application. It consumes the official `quantconnect/lean` engine image and the official `QuantConnect.Algorithm` NuGet package, then layers the TradePilot algorithm and control plane on top. Apache-2.0 attribution is retained in `THIRD_PARTY_NOTICES.md` and `lean-engine/LICENSE-APACHE-2.0.txt`.

## 2. What was rebuilt

### Official LEAN engine integration

Added:

- `lean-engine/Dockerfile`
- `lean-engine/TradePilot.Algorithm/TradePilot.Algorithm.csproj`
- `lean-engine/TradePilot.Algorithm/TradePilotLeanAlgorithm.cs`
- `lean-engine/config/backtest.template.json`
- `lean-engine/config/paper.template.json`
- `lean-engine/LICENSE-APACHE-2.0.txt`

The algorithm project targets .NET 10 and pins `QuantConnect.Algorithm` version `2.5.17654`.

The same `QCAlgorithm` source is used for historical and Alpaca paper execution. It includes:

- configurable liquid US-equity watchlist
- SPY market-regime filter
- EMA20, EMA50 and SMA200 trend alignment
- 20-session breakout confirmation
- relative volume and 60-session relative strength
- ATR, RSI, candle-quality and extension scoring
- configurable minimum setup score
- portfolio-risk and stop-distance position sizing
- maximum concurrent positions
- daily-loss and portfolio-drawdown circuit breakers
- asynchronous market entries
- weighted-average accounting for partial entry fills
- immediate protective stop and target resizing after every partial entry fill
- broker-side stop-market and limit-target orders
- sibling protective-order cancellation
- explicit position closing state
- cancellation of outstanding entry orders during exits
- conservative flattening after a partial protective fill
- restoration of protective orders when an exit is rejected or cancelled
- breakeven and trailing-stop updates
- EMA20 and maximum-holding-period exits
- cleanup of completed order-to-position mappings

### Secure LEAN gateway

Added an always-on Node.js gateway under `lean-gateway/` that:

- exposes authenticated backtest, paper and stop endpoints
- defaults to non-executing dry-run validation
- hard-blocks live-money configuration
- permits only one active paper engine
- validates and canonicalizes dates, symbols, cash and strategy parameters
- discards unknown request fields instead of persisting them
- creates per-job LEAN configuration files with mode `0600`
- keeps Alpaca and QuantConnect credentials out of job records
- deletes credential-bearing job configurations after dry run, completion, stop or failure
- runs backtests without container network access
- applies memory, CPU, process and `no-new-privileges` limits
- watches both backtest and paper containers
- captures logs and result summaries
- reconciles active jobs after a gateway restart
- removes failed validation directories instead of leaving partial jobs

A systemd unit template is supplied in `deploy/tradepilot-lean-gateway.service`.

### TypeScript backend

Added:

- `backend/src/services/lean/leanTypes.ts`
- `backend/src/services/lean/leanEngineService.ts`
- `backend/src/__tests__/leanEngineService.test.ts`

Added protected API operations for:

- LEAN status
- job list and job details
- backtest creation
- Alpaca paper-session creation
- job stop

`TRADING_ENGINE=lean` makes LEAN the single automated execution authority:

- the legacy TypeScript automation loop cannot open new automatic positions
- direct legacy broker submission is rejected
- legacy simulated positions may still be monitored and closed safely
- AI/news research remains advisory and cannot bypass LEAN or risk controls

### Frontend

Added:

- `frontend/src/pages/LeanEnginePage.tsx`
- `/lean` application route
- LEAN navigation item
- engine health and capability status
- historical backtest form
- paper-session start/stop controls
- job history and result summaries
- LEAN status in the Automation Center

### Python removal

Removed:

- the Python analysis service
- Python API client and route
- Python Render service
- Python environment configuration
- Node-to-Python HTTP dependency

The remaining application uses React/TypeScript, Node.js/Express, PostgreSQL/Prisma, the Node gateway and the C# LEAN algorithm. No Python runtime is required.

## 3. Paper-only safeguards

The release contains independent safeguards:

1. `ALLOW_LIVE_BROKER_TRADING=false` in supplied examples.
2. The TypeScript adapter rejects paper-job requests if live trading is enabled.
3. The gateway refuses to start when the live-money flag is enabled.
4. The Alpaca configuration is fixed to `paper`.
5. The old direct broker adapter is blocked in LEAN mode.
6. Docker execution defaults to `LEAN_EXECUTION_ENABLED=false`.
7. A minimum 24-character gateway token is required before execution can be enabled.
8. Broker and QuantConnect credentials are read from private gateway environment variables only.

## 4. Validation completed

| Check | Result |
|---|---|
| Backend dependency installation | Passed; npm reported 0 vulnerabilities |
| Frontend dependency installation | Passed; npm reported 0 vulnerabilities |
| Backend test suites | **Passed: 7 suites, 30 tests, 0 failures** |
| Focused TypeScript compilation of LEAN adapter/tests | Passed |
| Frontend TypeScript check | Passed |
| Frontend production build | Passed |
| Gateway JavaScript syntax check | Passed |
| LEAN static engine/configuration validation | Passed |
| Gateway public health and authenticated access checks | Passed |
| Unauthorized job-list rejection | Passed |
| Backtest dry-run lifecycle | Passed; status `COMPLETED` |
| Paper dry-run lifecycle | Passed; status `COMPLETED` |
| Invalid calendar-date rejection | Passed |
| Unknown field and invalid-symbol removal | Passed |
| Credential/secret redaction from job records | Passed |
| Generated-config cleanup after dry runs | Passed; zero configs remained |
| Failed-validation directory cleanup | Passed |
| Live-money startup guard | Passed; process exited non-zero |
| Weak-token startup guard | Passed; process exited non-zero |
| JSON configuration parsing | Passed |
| Render YAML parsing | Passed |
| Python runtime reference scan | Passed; none in executable application code |

Frontend advisory:

- The production JavaScript bundle is approximately 808 KB and exceeds Vite's default 500 KB advisory threshold. The build succeeds, but route-level code splitting is recommended for faster mobile loading.

## 5. Checks that could not be completed here

### Full Prisma-backed backend type-check

The artifact environment could not resolve `binaries.prisma.sh`, so `prisma generate` failed with `EAI_AGAIN`. The existing placeholder Prisma client does not contain the generated application models, which causes the complete backend TypeScript check to report missing Prisma types. This is an environment/download limitation, not a passing validation.

Mandatory command on a normal networked machine or Render build:

```bash
cd backend
npm ci --include=dev
npm run prisma:generate:postgres
npm run check
npm run build
```

### C# compilation and actual LEAN runtime

Docker Engine and the .NET SDK are not installed in the artifact environment. Therefore, the custom algorithm and final LEAN image were statically validated but not compiled or executed here.

Mandatory command on the Docker host:

```bash
npm run build:lean-engine
```

Then execute a historical backtest with valid point-in-time LEAN data before enabling paper execution.

### Alpaca local brokerage entitlement

The official local Alpaca brokerage integration can require QuantConnect user/API/organization credentials and eligible local brokerage/module entitlement. Those private credentials and entitlements are not included. The gateway fails clearly when execution is enabled without the required values.

## 6. Installation and run commands

### Install JavaScript dependencies

```bash
cp .env.example .env
cp lean-gateway/.env.example lean-gateway/.env
npm run install:all
```

### Build LEAN

```bash
npm run build:lean-engine
```

### Start backend

```bash
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

For production PostgreSQL, use the PostgreSQL schema scripts configured by the deployment.

### Start frontend

```bash
cd frontend
npm run dev
```

### Start gateway

```bash
cd lean-gateway
npm start
```

Keep this setting initially:

```env
LEAN_EXECUTION_ENABLED=false
```

Only change it after image compilation, data validation and a successful historical backtest.

## 7. Required release gate before Alpaca paper execution

- Build the LEAN image with zero C# errors.
- Use licensed point-in-time historical data with map and factor files.
- Run backtests over bull, bear, sideways and high-volatility periods.
- Run out-of-sample and walk-forward tests.
- Check survivorship bias, look-ahead bias and parameter sensitivity.
- Include realistic fees, spread and slippage.
- Confirm every partial fill and protective order in LEAN logs.
- Reconcile LEAN holdings, cash and orders against Alpaca paper state.
- Confirm protective orders survive dashboard/API outages.
- Keep `ALLOW_LIVE_BROKER_TRADING=false`.
- Use shadow/backtest operation before a persistent paper session.

## 8. Final status

- **TradePilot LEAN Edition is the main packaged version:** Yes.
- **Complete official LEAN engine integrated:** Yes, through the official upstream image/package.
- **Same algorithm source for backtest and paper:** Yes.
- **Node.js/TypeScript backend retained:** Yes.
- **React dashboard retained:** Yes.
- **Python required:** No.
- **Real-money trading enabled:** No.
- **Populated secrets included:** No populated secret files were intentionally included.
- **Ready for immediate live-money trading:** No.
- **Ready for Docker-host compilation and controlled backtesting:** Yes.
