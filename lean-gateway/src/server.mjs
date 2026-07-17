import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");

function loadLocalEnv() {
  const envPath = resolve(here, "../.env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();
const port = Number(process.env.PORT ?? 8090);
const token = process.env.LEAN_GATEWAY_TOKEN ?? "";
const image = process.env.LEAN_ENGINE_IMAGE ?? "tradepilot-lean-engine:latest";
const executionEnabled = String(process.env.LEAN_EXECUTION_ENABLED ?? "false").toLowerCase() === "true";
const runtimeDir = resolve(projectRoot, process.env.LEAN_RUNTIME_DIR ?? "lean-gateway/runtime");
const configDir = resolve(projectRoot, process.env.LEAN_CONFIG_DIR ?? "lean-engine/config");
const jobsFile = join(runtimeDir, "jobs", "index.json");
const dataDir = join(runtimeDir, "data");
const resultsDir = join(runtimeDir, "results");
const dockerMemory = process.env.LEAN_DOCKER_MEMORY ?? "4g";
const dockerCpus = process.env.LEAN_DOCKER_CPUS ?? "2";


function validateGatewayConfiguration() {
  if (executionEnabled && token.length < 24) {
    throw new Error("LEAN_GATEWAY_TOKEN must contain at least 24 characters when execution is enabled.");
  }
  if (String(process.env.ALLOW_LIVE_BROKER_TRADING ?? "false").toLowerCase() === "true") {
    throw new Error("TradePilot LEAN Gateway refuses to start when live-money trading is enabled.");
  }
}

validateGatewayConfiguration();

for (const path of [dirname(jobsFile), dataDir, resultsDir]) mkdirSync(path, { recursive: true });
if (!existsSync(jobsFile)) writeFileSync(jobsFile, "[]\n");

function now() {
  return new Date().toISOString();
}

function readJobs() {
  try {
    return JSON.parse(readFileSync(jobsFile, "utf8"));
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  writeFileSync(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`);
}

function upsertJob(job) {
  const jobs = readJobs();
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.unshift(job);
  saveJobs(jobs.slice(0, 250));
  return job;
}

function updateJob(id, patch) {
  const jobs = readJobs();
  const index = jobs.findIndex((item) => item.id === id);
  if (index < 0) return null;
  jobs[index] = { ...jobs[index], ...patch };
  saveJobs(jobs);
  return jobs[index];
}

function dockerStatus() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
  return {
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : null,
    error: result.status === 0 ? null : String(result.stderr || result.error?.message || "Docker unavailable").trim()
  };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request body is too large.");
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function authenticate(req) {
  if (!token) return false;
  return req.headers.authorization === `Bearer ${token}`;
}

function safeDate(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Invalid ISO date: ${text}`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`Invalid calendar date: ${text}`);
  }
  return text;
}

const allowedStrategyParameters = new Set([
  "risk-per-trade",
  "max-portfolio-drawdown",
  "max-daily-loss",
  "max-open-positions",
  "breakout-lookback",
  "max-holding-days",
  "minimum-score"
]);

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function sanitizedTicker(value, fallback = "SPY") {
  const ticker = String(value ?? fallback).toUpperCase().trim();
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker) ? ticker : fallback;
}

function sanitizeParameters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const parameters = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedStrategyParameters.has(key)) continue;
    if (!["string", "number", "boolean"].includes(typeof raw)) continue;
    const text = String(raw).trim();
    if (text.length === 0 || text.length > 64) continue;
    parameters[key] = text;
  }
  return parameters;
}

function sanitizeSymbols(value) {
  if (!Array.isArray(value)) return undefined;
  const symbols = value
    .map((item) => String(item).toUpperCase().trim())
    .filter((item) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(item));
  return [...new Set(symbols)].slice(0, 100);
}

function normalizeJobRequest(mode, value) {
  const request = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {
    initialCash: finiteNumber(request.initialCash, 100_000, 1_000, 1_000_000_000),
    benchmark: sanitizedTicker(request.benchmark),
    symbols: sanitizeSymbols(request.symbols),
    parameters: sanitizeParameters(request.parameters)
  };
  if (mode === "BACKTEST") {
    normalized.startDate = safeDate(request.startDate, "2016-01-01");
    normalized.endDate = safeDate(request.endDate, new Date().toISOString().slice(0, 10));
    if (Date.parse(normalized.startDate) >= Date.parse(normalized.endDate)) {
      throw new Error("Backtest startDate must be earlier than endDate.");
    }
  }
  return normalized;
}

function buildConfig(mode, request, jobDir) {
  const templateName = mode === "BACKTEST" ? "backtest.template.json" : "paper.template.json";
  const config = JSON.parse(readFileSync(join(configDir, templateName), "utf8"));
  const parameters = {
    "initial-cash": String(request.initialCash),
    "benchmark": request.benchmark,
    ...(request.symbols?.length ? { symbols: request.symbols.join(",") } : {}),
    ...request.parameters
  };

  if (mode === "BACKTEST") {
    parameters["start-date"] = request.startDate;
    parameters["end-date"] = request.endDate;
  } else {
    if (String(process.env.ALLOW_LIVE_BROKER_TRADING ?? "false").toLowerCase() === "true") {
      throw new Error("Live-money trading must remain disabled.");
    }
    const key = process.env.ALPACA_API_KEY_ID ?? "";
    const secret = process.env.ALPACA_API_SECRET_KEY ?? "";
    if (!key || !secret) throw new Error("Alpaca paper credentials are missing on the LEAN gateway.");

    const quantConnectUserId = process.env.QUANTCONNECT_USER_ID ?? "";
    const quantConnectApiToken = process.env.QUANTCONNECT_API_TOKEN ?? "";
    const quantConnectOrganizationId = process.env.QUANTCONNECT_ORGANIZATION_ID ?? "";
    if (executionEnabled && (!quantConnectUserId || !quantConnectApiToken || !quantConnectOrganizationId)) {
      throw new Error("QuantConnect user, API token and organization ID are required by the official local Alpaca brokerage module.");
    }

    config["alpaca-api-key"] = key;
    config["alpaca-api-secret"] = secret;
    config["alpaca-environment"] = "paper";
    config["alpaca-paper-trading"] = true;
    config["alpaca-access-token"] = "";
    if (quantConnectUserId) config["job-user-id"] = Number(quantConnectUserId);
    if (quantConnectApiToken) config["api-access-token"] = quantConnectApiToken;
    if (quantConnectOrganizationId) config["job-organization-id"] = quantConnectOrganizationId;
  }

  config.parameters = Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, String(value)]));
  const configPath = join(jobDir, "config.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return configPath;
}

function dockerArgs(job, configPath, resultPath) {
  const args = [
    "run",
    "-d",
    "--memory",
    dockerMemory,
    "--cpus",
    dockerCpus,
    "--pids-limit",
    "512",
    "--security-opt",
    "no-new-privileges",
    "--stop-timeout",
    "30",
    "--name",
    `tradepilot-lean-${job.id}`,
    "--label",
    "app=tradepilot-lean",
    "--label",
    `tradepilot.job=${job.id}`,
    "-v",
    `${configPath}:/Lean/Launcher/bin/Debug/config.json:ro`,
    "-v",
    `${dataDir}:/Lean/Data:ro`,
    "-v",
    `${resultPath}:/Results`
  ];
  if (job.mode === "BACKTEST") args.push("--network", "none");
  args.push(image);
  return args;
}

function deleteGeneratedConfig(jobId) {
  const configPath = join(runtimeDir, "jobs", jobId, "config.json");
  try {
    if (existsSync(configPath)) unlinkSync(configPath);
  } catch {
    // Keep job finalization fail-safe even if secure cleanup needs manual intervention.
  }
}

function jsonFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...jsonFiles(fullPath));
    else if (entry.toLowerCase().endsWith(".json")) files.push(fullPath);
  }
  return files;
}

function readBacktestSummary(resultPath) {
  for (const file of jsonFiles(resultPath)) {
    try {
      const payload = JSON.parse(readFileSync(file, "utf8"));
      const statistics = payload.Statistics ?? payload.statistics;
      const portfolio = payload.TotalPerformance?.PortfolioStatistics ?? payload.totalPerformance?.portfolioStatistics;
      if (!statistics && !portfolio) continue;
      return {
        resultFile: file,
        statistics: statistics ?? null,
        portfolioStatistics: portfolio ?? null
      };
    } catch {
      // Ignore unrelated or incomplete JSON result files.
    }
  }
  return null;
}

const watchedContainers = new Set();

function watchJob(job) {
  if (!job?.containerId || watchedContainers.has(job.containerId)) return;
  watchedContainers.add(job.containerId);
  const child = spawn("docker", ["wait", job.containerId], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.on("close", () => {
    watchedContainers.delete(job.containerId);
    const exitCode = Number(stdout.trim() || 1);
    const logs = spawnSync("docker", ["logs", job.containerId], { encoding: "utf8", maxBuffer: 10_000_000 });
    const logPath = join(job.resultPath, "lean-container.log");
    writeFileSync(logPath, `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`);
    spawnSync("docker", ["rm", job.containerId], { encoding: "utf8" });
    deleteGeneratedConfig(job.id);

    const latest = readJobs().find((item) => item.id === job.id);
    const wasStopped = latest?.status === "STOPPED";
    updateJob(job.id, {
      status: wasStopped ? "STOPPED" : exitCode === 0 ? "COMPLETED" : "FAILED",
      finishedAt: latest?.finishedAt ?? now(),
      containerId: null,
      error: wasStopped || exitCode === 0 ? null : stderr || `LEAN exited with code ${exitCode}.`,
      summary: {
        ...(latest?.summary && typeof latest.summary === "object" ? latest.summary : {}),
        exitCode,
        logPath,
        leanResult: job.mode === "BACKTEST" ? readBacktestSummary(job.resultPath) : null
      }
    });
  });
}

function reconcileRunningJobs() {
  if (!executionEnabled || !dockerStatus().available) return;
  for (const job of readJobs().filter((item) => ["STARTING", "RUNNING"].includes(item.status))) {
    if (!job.containerId) {
      deleteGeneratedConfig(job.id);
      updateJob(job.id, { status: "FAILED", finishedAt: now(), error: "LEAN gateway restarted without a container ID." });
      continue;
    }
    const inspected = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", job.containerId], { encoding: "utf8" });
    if (inspected.status === 0 && inspected.stdout.trim() === "true") {
      updateJob(job.id, { status: "RUNNING" });
      watchJob(job);
    } else {
      deleteGeneratedConfig(job.id);
      updateJob(job.id, {
        status: "FAILED",
        finishedAt: now(),
        containerId: null,
        error: "LEAN container was not running when the gateway recovered. Review Docker logs and reconcile broker state."
      });
    }
  }
}

function createJob(mode, request) {
  const normalizedRequest = normalizeJobRequest(mode, request);
  if (mode === "PAPER") {
    const activePaper = readJobs().find((item) => item.mode === "PAPER" && ["QUEUED", "STARTING", "RUNNING"].includes(item.status));
    if (activePaper) throw new Error(`A LEAN paper engine is already active (${activePaper.id}).`);
  }

  const id = randomUUID();
  const jobDir = join(runtimeDir, "jobs", id);
  const resultPath = join(resultsDir, id);
  mkdirSync(jobDir, { recursive: true });
  mkdirSync(resultPath, { recursive: true });
  const job = {
    id,
    mode,
    status: "QUEUED",
    algorithm: "TradePilot.Lean.TradePilotLeanAlgorithm",
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    containerId: null,
    resultPath,
    error: null,
    request: normalizedRequest,
    summary: null
  };

  let configPath;
  try {
    configPath = buildConfig(mode, normalizedRequest, jobDir);
  } catch (error) {
    rmSync(jobDir, { recursive: true, force: true });
    rmSync(resultPath, { recursive: true, force: true });
    throw error;
  }
  upsertJob(job);
  const args = dockerArgs(job, configPath, resultPath);

  if (!executionEnabled) {
    deleteGeneratedConfig(id);
    return updateJob(id, {
      status: "COMPLETED",
      finishedAt: now(),
      summary: {
        dryRun: true,
        reason: "Set LEAN_EXECUTION_ENABLED=true after Docker, data and paper credentials are configured.",
        command: ["docker", ...args.map((value) => value === configPath ? "<generated-config>" : value)]
      }
    });
  }

  const docker = dockerStatus();
  if (!docker.available) {
    deleteGeneratedConfig(id);
    return updateJob(id, { status: "FAILED", finishedAt: now(), error: docker.error });
  }

  updateJob(id, { status: "STARTING", startedAt: now() });
  const launched = spawnSync("docker", args, { encoding: "utf8" });
  if (launched.status !== 0) {
    deleteGeneratedConfig(id);
    return updateJob(id, {
      status: "FAILED",
      finishedAt: now(),
      error: String(launched.stderr || launched.error?.message || "Unable to start LEAN container").trim()
    });
  }

  const containerId = launched.stdout.trim();
  const running = updateJob(id, { status: "RUNNING", startedAt: now(), containerId });
  watchJob(running);
  return running;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const docker = dockerStatus();
      return send(res, 200, {
        ok: true,
        app: "TradePilot LEAN Gateway",
        paperOnly: true,
        executionEnabled,
        engineImage: image,
        docker
      });
    }

    if (!authenticate(req)) return send(res, 401, { error: "Unauthorized." });

    if (req.method === "GET" && url.pathname === "/jobs") return send(res, 200, readJobs());

    const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/i);
    if (req.method === "GET" && jobMatch) {
      const job = readJobs().find((item) => item.id === jobMatch[1]);
      return job ? send(res, 200, job) : send(res, 404, { error: "LEAN job not found." });
    }

    if (req.method === "POST" && url.pathname === "/jobs/backtest") {
      const request = await bodyJson(req);
      return send(res, 202, createJob("BACKTEST", request));
    }

    if (req.method === "POST" && url.pathname === "/jobs/paper") {
      const request = await bodyJson(req);
      return send(res, 202, createJob("PAPER", request));
    }

    const stopMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)\/stop$/i);
    if (req.method === "POST" && stopMatch) {
      const job = readJobs().find((item) => item.id === stopMatch[1]);
      if (!job) return send(res, 404, { error: "LEAN job not found." });
      if (job.containerId) {
        watchJob(job);
        spawnSync("docker", ["stop", job.containerId], { encoding: "utf8" });
      } else {
        deleteGeneratedConfig(job.id);
      }
      const stopped = updateJob(job.id, { status: "STOPPED", finishedAt: now() });
      return send(res, 200, stopped);
    }

    return send(res, 404, { error: "Route not found." });
  } catch (error) {
    return send(res, 400, { error: error instanceof Error ? error.message : "Unexpected gateway error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  reconcileRunningJobs();
  console.log(`TradePilot LEAN Gateway listening on 0.0.0.0:${port}`);
});
