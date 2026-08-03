import dotenv from "dotenv";
import { startAutomationWorkers } from "./services/automationService.js";
import { prisma } from "./utils/prisma.js";

dotenv.config();

async function shutdown(signal: string) {
  console.log(`TradePilot worker received ${signal}; shutting down.`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await startAutomationWorkers();
console.log("TradePilot automation worker is running.");

setInterval(() => {
  // Keep the container alive while node-cron owns the scheduled work.
}, 60_000);
