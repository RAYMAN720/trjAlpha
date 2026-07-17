import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { tradePilotPrisma?: PrismaClient };
let client: PrismaClient | undefined = globalForPrisma.tradePilotPrisma;

function getClient() {
  if (!client) {
    client = new PrismaClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.tradePilotPrisma = client;
  }
  return client;
}

// Lazy initialization keeps pure unit tests and non-database CLI checks from loading
// a native Prisma engine until a database operation is actually requested.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const activeClient = getClient();
    const value = Reflect.get(activeClient, property, activeClient);
    return typeof value === "function" ? value.bind(activeClient) : value;
  }
});
