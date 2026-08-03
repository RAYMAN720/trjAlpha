import { prisma } from "../utils/prisma.js";
import { currentUserId, getRequestContext } from "../utils/requestContext.js";
import type { AssetType } from "./marketDataProvider.js";
import { getOrCreateUserSettings } from "./userSettingsService.js";

async function alertOwnerId() {
  return getRequestContext()?.userId ?? (await getOrCreateUserSettings()).id;
}

export async function createAlert(input: {
  assetType?: AssetType;
  ticker?: string;
  alertType: string;
  message: string;
  severity?: string;
  targetPrice?: number;
}) {
  return prisma.alert.create({
    data: {
      userId: await alertOwnerId(),
      assetType: input.assetType ?? "stock",
      ticker: input.ticker ?? "SYSTEM",
      alertType: input.alertType,
      targetPrice: input.targetPrice,
      message: input.message,
      severity: input.severity ?? "Info",
      active: true
    }
  });
}

export async function markAlertRead(id: string) {
  const userId = currentUserId();
  const owned = await prisma.alert.findFirst({ where: { id, userId } });
  if (!owned) throw Object.assign(new Error("Alert not found."), { status: 404 });
  return prisma.alert.update({ where: { id }, data: { active: false, readAt: new Date() } });
}
