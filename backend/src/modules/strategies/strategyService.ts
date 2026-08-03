import { createHash } from "node:crypto";
import { prisma } from "../../utils/prisma.js";
import { writeAuditEvent } from "../../services/auditService.js";

export async function listStrategies(userId: string) {
  return prisma.strategy.findMany({ where: { userId }, include: { versions: { orderBy: { version: "desc" }, take: 10 } }, orderBy: { updatedAt: "desc" } });
}

export async function createStrategy(userId: string, input: { name: string; description?: string; source?: string; parameters?: unknown }) {
  const name = input.name.trim();
  if (!name) throw Object.assign(new Error("Strategy name is required."), { status: 400 });
  const codeHash = createHash("sha256").update(input.source ?? "").digest("hex");
  const strategy = await prisma.strategy.create({
    data: {
      userId, name, description: input.description,
      versions: { create: { version: 1, semanticVersion: "1.0.0", codeHash, sourceRef: input.source ? "inline:first-version" : null, parametersJson: JSON.stringify(input.parameters ?? {}) } }
    },
    include: { versions: true }
  });
  await writeAuditEvent({ action: "STRATEGY_CREATED", resource: "Strategy", resourceId: strategy.id });
  return strategy;
}

export async function createStrategyVersion(userId: string, strategyId: string, input: { source?: string; parameters?: unknown; semanticVersion?: string }) {
  const strategy = await prisma.strategy.findFirst({ where: { id: strategyId, userId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!strategy) throw Object.assign(new Error("Strategy not found."), { status: 404 });
  const version = (strategy.versions[0]?.version ?? 0) + 1;
  const source = input.source ?? "";
  const created = await prisma.strategyVersion.create({
    data: {
      strategyId, version, semanticVersion: input.semanticVersion ?? `1.${version - 1}.0`,
      codeHash: createHash("sha256").update(source).digest("hex"),
      sourceRef: source ? `inline:v${version}` : null,
      parametersJson: JSON.stringify(input.parameters ?? {})
    }
  });
  await writeAuditEvent({ action: "STRATEGY_VERSION_CREATED", resource: "StrategyVersion", resourceId: created.id, metadata: { strategyId, version } });
  return created;
}
