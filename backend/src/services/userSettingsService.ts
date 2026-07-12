import { prisma } from "../utils/prisma.js";

const defaultUserEmail = "demo@tradepilot.local";

export async function getOrCreateUserSettings() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  return prisma.user.upsert({
    where: { email: defaultUserEmail },
    update: {},
    create: {
      name: "Demo User",
      email: defaultUserEmail,
      displayCurrency: "USD",
      realTradingEnabled: false,
      autoPaperTrading: true
    }
  });
}
