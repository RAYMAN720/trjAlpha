import "dotenv/config";
import { prisma } from "../utils/prisma.js";
import { getLeanJob, startLeanPaperTrading, submitLeanBacktest } from "../services/lean/leanEngineService.js";
import { decryptCredential } from "../services/security/credentialVault.js";

const workerId = process.env.WORKER_ID ?? `lean-worker-${process.pid}`;
const pollMs = Math.max(500, Number(process.env.LEAN_WORKER_POLL_MS ?? 2000));
let stopping = false;

const terminalStatuses = new Set(["COMPLETED", "FAILED", "STOPPED", "CANCELLED", "ERROR"]);

async function syncDispatchedJobs() {
  const jobs = await prisma.leanJobRecord.findMany({
    where: { externalJobId: { not: null }, status: { notIn: [...terminalStatuses] } },
    orderBy: { updatedAt: "asc" },
    take: 20
  });
  for (const job of jobs) {
    if (!job.externalJobId) continue;
    try {
      const remote = await getLeanJob(job.externalJobId);
      const status = String(remote.status ?? job.status).toUpperCase();
      const terminal = terminalStatuses.has(status);
      await prisma.leanJobRecord.update({
        where: { id: job.id },
        data: {
          status,
          resultJson: JSON.stringify(remote),
          error: typeof remote.error === "string" ? remote.error : null,
          finishedAt: terminal ? new Date() : null
        }
      });
    } catch (error) {
      console.warn(`[${workerId}] unable to poll ${job.externalJobId}`, error);
    }
  }
}

async function claimJob() {
  const candidate = await prisma.leanJobRecord.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await prisma.leanJobRecord.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "DISPATCHING", startedAt: new Date(), error: null }
  });
  return claimed.count === 1 ? candidate : null;
}

async function processJob() {
  const job = await claimJob();
  if (!job) return;
  try {
    const request = JSON.parse(job.requestJson) as Record<string, unknown>;
    let result;
    if (job.mode === "PAPER") {
      let brokerCredential: { keyId: string; secretKey: string } | undefined;
      const brokerAccountId = typeof request.brokerAccountId === "string" ? request.brokerAccountId : undefined;
      if (brokerAccountId) {
        const account = await prisma.brokerAccount.findFirst({ where: { id: brokerAccountId, userId: job.userId } });
        if (!account?.encryptedCredential) throw new Error("LEAN paper job requires a connected broker account.");
        brokerCredential = decryptCredential<{ keyId: string; secretKey: string }>(account.encryptedCredential);
      }
      const { brokerAccountId: _removed, ...leanRequest } = request;
      result = await startLeanPaperTrading({ ...leanRequest, brokerCredential } as never);
    } else {
      result = await submitLeanBacktest(request as never);
    }
    await prisma.leanJobRecord.update({
      where: { id: job.id },
      data: { externalJobId: result.id, status: result.status ?? "DISPATCHED", resultJson: JSON.stringify(result), updatedAt: new Date() }
    });
    console.log(`[${workerId}] dispatched ${job.id} -> ${result.id}`);
  } catch (error) {
    await prisma.leanJobRecord.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : "LEAN dispatch failed" } });
    console.error(`[${workerId}] job ${job.id} failed`, error);
  }
}

async function loop() {
  while (!stopping) {
    await syncDispatchedJobs().catch((error) => console.error(`[${workerId}] sync`, error));
    await processJob().catch((error) => console.error(`[${workerId}]`, error));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await prisma.$disconnect();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
void loop();
