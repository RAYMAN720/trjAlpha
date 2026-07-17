import { prisma } from "../../utils/prisma.js";

const CONTROL_ID = "global";

export async function getTradingControl() {
  return prisma.tradingControl.upsert({
    where: { id: CONTROL_ID },
    update: {},
    create: {
      id: CONTROL_ID,
      newEntriesEnabled: true,
      emergencyHalt: false
    }
  });
}

export async function haltNewPaperEntries(reason: string) {
  const normalizedReason = reason.trim() || "Manual professional safety halt.";
  return prisma.tradingControl.upsert({
    where: { id: CONTROL_ID },
    update: {
      newEntriesEnabled: false,
      emergencyHalt: true,
      reason: normalizedReason,
      haltedAt: new Date()
    },
    create: {
      id: CONTROL_ID,
      newEntriesEnabled: false,
      emergencyHalt: true,
      reason: normalizedReason,
      haltedAt: new Date()
    }
  });
}

export async function resumePaperEntries(reason = "Paper-entry safety review completed.") {
  return prisma.tradingControl.upsert({
    where: { id: CONTROL_ID },
    update: {
      newEntriesEnabled: true,
      emergencyHalt: false,
      reason: reason.trim() || null,
      resumedAt: new Date()
    },
    create: {
      id: CONTROL_ID,
      newEntriesEnabled: true,
      emergencyHalt: false,
      reason: reason.trim() || null,
      resumedAt: new Date()
    }
  });
}

export async function assertNewPaperEntriesEnabled() {
  const control = await getTradingControl();
  if (!control.newEntriesEnabled || control.emergencyHalt) {
    throw new Error(`New paper entries are halted: ${control.reason ?? "professional safety control"}`);
  }
  return control;
}
