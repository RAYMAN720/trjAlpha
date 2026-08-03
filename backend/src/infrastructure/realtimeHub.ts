import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { redis } from "./redisClient.js";
import { subscribeRedisPattern } from "./redisSubscriber.js";

const clients = new Map<string, Set<Duplex>>();
const realtimeInstanceId = `${process.pid}-${Math.random().toString(36).slice(2)}`;

function secret() {
  return process.env.APP_AUTH_SECRET?.trim() || "tradepilot-local-dev-secret-change-me";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createRealtimeTicket(userId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyRealtimeTicket(ticket: string) {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string; exp: number };
    return parsed.sub && parsed.exp > Date.now() ? parsed.sub : null;
  } catch { return null; }
}

function frameText(payload: string) {
  const data = Buffer.from(payload, "utf8");
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  if (data.length < 65536) {
    const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(data.length, 2);
    return Buffer.concat([header, data]);
  }
  const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2);
  return Buffer.concat([header, data]);
}

// RFC6455 uses SHA-1, not HMAC.
import { createHash } from "node:crypto";
function websocketAccept(key: string) {
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

export function handleRealtimeUpgrade(req: IncomingMessage, socket: Duplex) {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname !== "/ws") return false;
    const userId = verifyRealtimeTicket(url.searchParams.get("ticket") ?? "");
    const key = req.headers["sec-websocket-key"];
    if (!userId || typeof key !== "string") {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return true;
    }
    socket.write([
      "HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAccept(key)}`, "\r\n"
    ].join("\r\n"));
    ensureCrossInstanceSubscription();
    const set = clients.get(userId) ?? new Set<Duplex>(); set.add(socket); clients.set(userId, set);
    socket.write(frameText(JSON.stringify({ type: "CONNECTED", at: new Date().toISOString() })));
    const cleanup = () => { set.delete(socket); if (!set.size) clients.delete(userId); };
    socket.on("close", cleanup); socket.on("error", cleanup); socket.on("end", cleanup);
    return true;
  } catch {
    socket.destroy(); return true;
  }
}

function deliverLocal(userId: string, envelope: string) {
  for (const socket of clients.get(userId) ?? []) {
    if (!socket.destroyed) socket.write(frameText(envelope));
  }
}

let crossInstanceSubscriptionStarted = false;
function ensureCrossInstanceSubscription() {
  if (crossInstanceSubscriptionStarted || !redis.configured()) return;
  crossInstanceSubscriptionStarted = true;
  subscribeRedisPattern("tradepilot:user:*", (channel, message) => {
    try {
      const payload = JSON.parse(message) as { origin?: string; envelope?: string };
      if (payload.origin === realtimeInstanceId || typeof payload.envelope !== "string") return;
      const userId = channel.slice("tradepilot:user:".length);
      if (userId) deliverLocal(userId, payload.envelope);
    } catch {
      // Ignore malformed pub/sub messages from unrelated publishers.
    }
  });
}

export async function publishRealtimeEvent(userId: string, event: unknown) {
  const envelope = JSON.stringify({ ...((event && typeof event === "object") ? event : { value: event }), at: new Date().toISOString() });
  deliverLocal(userId, envelope);
  if (redis.configured()) {
    await redis.publish(`tradepilot:user:${userId}`, JSON.stringify({ origin: realtimeInstanceId, envelope })).catch(() => undefined);
  }
}

const heartbeatTimer = setInterval(() => {
  const heartbeat = frameText(JSON.stringify({ type: "HEARTBEAT", at: new Date().toISOString() }));
  for (const set of clients.values()) for (const socket of set) if (!socket.destroyed) socket.write(heartbeat);
}, 25_000);
if (typeof (heartbeatTimer as unknown as { unref?: () => void }).unref === "function") {
  (heartbeatTimer as unknown as { unref: () => void }).unref();
}
