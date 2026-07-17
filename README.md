# TradePilot Professional V2

TradePilot Professional V2 is a Node.js, Express, TypeScript, PostgreSQL, Redis-ready, React market research and paper-trading system.

The application is paper-trading only. Real-money trading is disabled by startup validation, broker guards, UI labels, and runtime order checks.

## Architecture

- Frontend: React + Vite + TypeScript
- Backend API: Node.js + Express + TypeScript
- Worker: Node.js + TypeScript automation worker
- Database: PostgreSQL on Render, SQLite for local development
- Queue/cache: Redis optional for locks and caching
- AI: direct TypeScript backend integration with safe fallback
- Analysis: TypeScript indicators, multi-timeframe analysis, strategy checks, execution simulation, and risk engine

No Python service, Python runtime, `pip`, `requirements.txt`, Python Docker image, or Node-to-Python communication is required.

## Safety

Required paper-mode variables:

```env
TRADING_MODE=paper
ALPACA_TRADING_ENV=paper
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets/v2
ALLOW_LIVE_BROKER_TRADING=false
```

The backend refuses unsafe startup settings and blocks broker orders unless the system remains in paper mode.

## Local Setup

```bash
npm run install:all
npm run prisma:generate
npm run seed
npm run check
npm test --prefix backend
npm run build
```

Run frontend:

```bash
npm run dev --prefix frontend
```

Run backend:

```bash
cd backend
TRADING_MODE=paper ALPACA_TRADING_ENV=paper DATABASE_URL="file:./dev.db" npm run dev
```

Run worker:

```bash
cd backend
TRADING_MODE=paper ALPACA_TRADING_ENV=paper DATABASE_URL="file:./dev.db" npm run worker
```

## Prisma

```bash
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Use `prisma/schema.postgres.prisma` for hosted PostgreSQL generation/deployment.

## Render

The blueprint defines:

- `tradepilot-frontend`: static React site
- `tradepilot-api`: Node.js Express API
- `tradepilot-worker`: Node.js automation worker
- `tradepilot-ai-scanner-db`: PostgreSQL
- `tradepilot-redis`: optional Redis

No Python service is defined.

## Secrets

Never commit real `.env` files or credentials. Use Render environment variables for production secrets.
