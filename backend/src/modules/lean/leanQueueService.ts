import { prisma } from "../../utils/prisma.js";

export async function enqueueLeanJob(userId: string, input: {
  mode: "BACKTEST" | "PAPER";
  portfolioId?: string;
  strategyVersionId?: string;
  request: unknown;
}) {
  if (input.portfolioId) {
    const portfolio = await prisma.portfolio.findFirst({ where: { id: input.portfolioId, userId } });
    if (!portfolio) throw Object.assign(new Error("Portfolio not found."), { status: 404 });
  }
  if (input.strategyVersionId) {
    const version = await prisma.strategyVersion.findFirst({ where: { id: input.strategyVersionId, strategy: { userId } } });
    if (!version) throw Object.assign(new Error("Strategy version not found."), { status: 404 });
  }
  return prisma.leanJobRecord.create({
    data: {
      userId, portfolioId: input.portfolioId, strategyVersionId: input.strategyVersionId,
      mode: input.mode, status: "QUEUED", requestJson: JSON.stringify(input.request ?? {})
    }
  });
}

export async function listUserLeanJobs(userId: string) {
  return prisma.leanJobRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
}
