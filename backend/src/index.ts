import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { apiRouter } from "./routes/api.js";
import { startAutomationWorkers } from "./services/automationService.js";
import { rateLimit } from "./infrastructure/rateLimit.js";
import { handleRealtimeUpgrade } from "./infrastructure/realtimeHub.js";
import { metricsMiddleware } from "./infrastructure/metrics.js";
import { registerDomainEventHandlers } from "./infrastructure/domainEventHandlers.js";
import { log } from "./infrastructure/logger.js";

dotenv.config();

registerDomainEventHandlers();

const app = express();
const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? "0.0.0.0";
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || randomUUID();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' https: wss: ws:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

const allowedOrigins = [
  ...(process.env.FRONTEND_URL ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  process.env.RENDER_EXTERNAL_URL?.trim()
].filter(Boolean);

function apiCorsForRequest(req: express.Request) {
  const sameHostOrigin = `${req.protocol}://${req.get("host")}`;
  const originMatchesRequestHost = (origin?: string) => {
    if (!origin) return false;
    try {
      return new URL(origin).host === req.get("host");
    } catch {
      return false;
    }
  };

  return cors({
    origin(origin, callback) {
      if (!origin || origin === sameHostOrigin || originMatchesRequestHost(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"]
  });
}

app.use("/api", (req, res, next) => apiCorsForRequest(req)(req, res, next));
app.use("/api", metricsMiddleware);
app.use(
  "/api",
  express.json({
    limit: "1mb"
  })
);

app.use("/api/auth", rateLimit({ windowSeconds: 300, max: 30, keyPrefix: "auth" }));
app.use("/api", rateLimit({ windowSeconds: 60, max: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 300), keyPrefix: "api" }));
app.use("/api", apiRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

const frontendDistCandidates = [
  path.resolve(process.cwd(), "../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist")
];
const frontendDistPath = frontendDistCandidates.find((candidate) => existsSync(path.join(candidate, "index.html")));

if (frontendDistPath && process.env.SERVE_FRONTEND_FROM_BACKEND !== "false") {
  app.use(express.static(frontendDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const candidateStatus = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: number }).status)
    : NaN;
  const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
  log(status >= 500 ? "error" : "warn", "http_request_failed", {
    requestId: res.getHeader("X-Request-ID"),
    method: req.method,
    path: req.originalUrl,
    status,
    error: message
  });
  res.status(status).json({ error: status >= 500 && process.env.NODE_ENV === "production" ? "Internal server error." : message });
});

const server = app.listen(port, host, () => {
  log("info", "api_started", { host, port, version: "4.0.0", workersOnApi: process.env.RUN_WORKERS_ON_START !== "false" });
  startAutomationWorkers().catch((error) => {
    log("error", "automation_workers_failed_to_start", { error: error instanceof Error ? error.message : String(error) });
  });
});

server.on("upgrade", (req, socket) => {
  if (!handleRealtimeUpgrade(req, socket)) socket.destroy();
});
