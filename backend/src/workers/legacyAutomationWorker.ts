import "dotenv/config";
import { startAutomationWorkers } from "../services/automationService.js";
import { log } from "../infrastructure/logger.js";
import { prisma } from "../utils/prisma.js";

const workerId = process.env.WORKER_ID ?? `automation-worker-${process.pid}`;

process.env.RUN_WORKERS_ON_START = "true";

async function start() {
  log("info", "legacy_automation_worker_starting", { workerId });
  await startAutomationWorkers();
  log("info", "legacy_automation_worker_started", { workerId });
}

async function shutdown(signal: string) {
  log("info", "legacy_automation_worker_stopping", { workerId, signal });
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });

void start().catch((error) => {
  log("error", "legacy_automation_worker_failed", { workerId, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
