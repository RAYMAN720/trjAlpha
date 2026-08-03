import { redis } from "./redisClient.js";

type Handler = (event: DomainEvent) => void | Promise<void>;
export type DomainEvent = { type: string; userId?: string; aggregateId?: string; payload?: unknown; at: string };
const handlers = new Map<string, Set<Handler>>();

export function onDomainEvent(type: string, handler: Handler) {
  const set = handlers.get(type) ?? new Set<Handler>();
  set.add(handler); handlers.set(type, set);
  return () => set.delete(handler);
}

export async function emitDomainEvent(input: Omit<DomainEvent, "at">) {
  const event: DomainEvent = { ...input, at: new Date().toISOString() };
  for (const handler of handlers.get(input.type) ?? []) await handler(event);
  for (const handler of handlers.get("*") ?? []) await handler(event);
  if (redis.configured()) await redis.publish("tradepilot:domain-events", JSON.stringify(event)).catch(() => undefined);
  return event;
}
