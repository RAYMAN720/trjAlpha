# TradePilot AI Scanner

Frontend-only rebuild shell.

The previous backend, database, workers, broker connector, Python engine, AI provider wiring, and API routes have been removed from this project. The active app is now a standalone Vite + React frontend that renders static mock UI only.

Safety state:

- Real trading: disabled
- Broker execution: removed
- Database: removed
- Workers: stopped
- API calls: removed from the active app shell

## Run Locally

```bash
npm run install:all
npm run dev
```

Open:

```text
http://127.0.0.1:8000
```

## Build

```bash
npm run check
npm run build
```

## Deploy

`render.yaml` now defines a static frontend service:

```yaml
runtime: static
buildCommand: cd frontend && npm ci && npm run build
staticPublishPath: frontend/dist
```

No backend environment variables or secrets are required.
