import { prisma } from "../utils/prisma.js";
import type { AssetType } from "./marketDataProvider.js";

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
  return prisma.alert.update({
    where: { id },
    data: {
      active: false,
      readAt: new Date()
    }
  });
}
