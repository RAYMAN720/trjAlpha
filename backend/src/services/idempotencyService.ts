import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function assertSameRequest(existing: { requestHash: string }, requestHash: string) {
  if (existing.requestHash === requestHash) return;
  const error = new Error("Idempotency key was already used with a different request.");
  (error as Error & { status?: number }).status = 409;
  throw error;
}

export async function acquireIdempotency(input: {
  userId: string;
  scope: string;
  key: string;
  request: unknown;
  ttlHours?: number;
}) {
  const requestHash = stableHash(input.request);
  const uniqueWhere = { userId_scope_key: { userId: input.userId, scope: input.scope, key: input.key } };
  const existing = await prisma.idempotencyRecord.findUnique({ where: uniqueWhere });
  if (existing) {
    assertSameRequest(existing, requestHash);
    return { existing, created: false } as const;
  }

  try {
    const created = await prisma.idempotencyRecord.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        key: input.key,
        requestHash,
        expiresAt: new Date(Date.now() + (input.ttlHours ?? 24) * 60 * 60 * 1000)
      }
    });
    return { existing: created, created: true } as const;
  } catch (error) {
    // Two API replicas may race between the read above and the unique INSERT.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await prisma.idempotencyRecord.findUnique({ where: uniqueWhere });
    if (!raced) throw error;
    assertSameRequest(raced, requestHash);
    return { existing: raced, created: false } as const;
  }
}

export async function completeIdempotency(id: string, input: { resourceId?: string; response: unknown; statusCode: number }) {
  return prisma.idempotencyRecord.update({
    where: { id },
    data: {
      resourceId: input.resourceId,
      responseJson: JSON.stringify(input.response),
      statusCode: input.statusCode
    }
  });
}
