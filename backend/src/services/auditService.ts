import { prisma } from "../utils/prisma.js";
import { getRequestContext } from "../utils/requestContext.js";

export async function writeAuditEvent(input: {
  action: string;
  resource: string;
  resourceId?: string | null;
  success?: boolean;
  metadata?: unknown;
  userId?: string | null;
}) {
  const context = getRequestContext();
  return prisma.auditEvent.create({
    data: {
      userId: input.userId ?? context?.userId ?? null,
      sessionId: context?.sessionId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      success: input.success ?? true,
      metadataJson: JSON.stringify(input.metadata ?? {})
    }
  });
}
