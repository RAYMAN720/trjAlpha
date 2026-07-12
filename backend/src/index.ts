import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { apiRouter } from "./routes/api.js";
import { startAutomationWorkers } from "./services/automationService.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? "0.0.0.0";
app.set("trust proxy", 1);

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
    allowedHeaders: ["Content-Type", "Authorization"]
  });
}

app.use("/api", (req, res, next) => apiCorsForRequest(req)(req, res, next));
app.use(
  "/api",
  express.json({
    limit: "1mb"
  })
);

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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(400).json({ error: message });
});

app.listen(port, host, () => {
  console.log(`TradePilot AI Scanner API running at http://${host}:${port}`);
  startAutomationWorkers().catch((error) => {
    console.error("Automation workers failed to start.", error);
  });
});
