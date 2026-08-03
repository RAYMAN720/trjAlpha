import { prisma } from "../utils/prisma.js";
import { getRequestContext } from "../utils/requestContext.js";

const defaultUserEmail = "demo@tradepilot.local";

export async function getOrCreateUserSettings() {
  const context = getRequestContext();
  if (context) {
    const existing = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!existing) throw new Error("Authenticated user no longer exists.");
    return existing;
  }

  // Background jobs without a request context use a dedicated system/demo user.
  return prisma.user.upsert({
    where: { email: defaultUserEmail },
    update: {},
    create: {
      name: "TradePilot System",
      email: defaultUserEmail,
      role: "SYSTEM",
      displayCurrency: "USD",
      realTradingEnabled: false,
      autoPaperTrading: true
    }
  });
}
