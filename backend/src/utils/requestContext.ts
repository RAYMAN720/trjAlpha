import { AsyncLocalStorage } from "node:async_hooks";

export type RequestUserContext = {
  userId: string;
  email: string;
  name: string;
  role: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const storage = new AsyncLocalStorage<RequestUserContext>();

export function runWithRequestContext<T>(context: RequestUserContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext() {
  return storage.getStore() ?? null;
}

export function requireRequestContext() {
  const context = storage.getStore();
  if (!context) throw new Error("Authenticated request context is unavailable.");
  return context;
}

export function currentUserId() {
  return requireRequestContext().userId;
}
