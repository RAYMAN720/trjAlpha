import net from "node:net";
import tls from "node:tls";
import { log } from "./logger.js";

function command(args: string[]) {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(arg, "utf8");
    parts.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

type RespResult = { value: unknown; next: number } | null;

function lineEnd(buffer: Buffer, start: number) {
  return buffer.indexOf(Buffer.from("\r\n"), start);
}

function parseResp(buffer: Buffer, offset = 0): RespResult {
  if (offset >= buffer.length) return null;
  const marker = String.fromCharCode(buffer[offset]);
  const end = lineEnd(buffer, offset + 1);
  if (end < 0) return null;
  const line = buffer.subarray(offset + 1, end).toString("utf8");
  const payloadStart = end + 2;
  if (marker === "+") return { value: line, next: payloadStart };
  if (marker === "-") return { value: new Error(`Redis error: ${line}`), next: payloadStart };
  if (marker === ":") return { value: Number(line), next: payloadStart };
  if (marker === "$") {
    const length = Number(line);
    if (length === -1) return { value: null, next: payloadStart };
    if (!Number.isFinite(length) || buffer.length < payloadStart + length + 2) return null;
    return { value: buffer.subarray(payloadStart, payloadStart + length).toString("utf8"), next: payloadStart + length + 2 };
  }
  if (marker === "*") {
    const count = Number(line);
    if (count === -1) return { value: null, next: payloadStart };
    const values: unknown[] = [];
    let next = payloadStart;
    for (let index = 0; index < count; index += 1) {
      const item = parseResp(buffer, next);
      if (!item) return null;
      values.push(item.value);
      next = item.next;
    }
    return { value: values, next };
  }
  return { value: line, next: payloadStart };
}

export function subscribeRedisPattern(pattern: string, onMessage: (channel: string, message: string) => void) {
  const rawUrl = process.env.REDIS_URL?.trim();
  if (!rawUrl) return () => undefined;
  const url = new URL(rawUrl);
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  let socket: net.Socket | tls.TLSSocket | null = null;
  let closed = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let buffer = Buffer.alloc(0);

  const connect = () => {
    if (closed) return;
    socket = url.protocol === "rediss:"
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port });
    socket.setKeepAlive(true, 20_000);
    socket.on("connect", () => {
      const writes: Buffer[] = [];
      if (url.password) {
        const username = decodeURIComponent(url.username || "default");
        writes.push(command(["AUTH", username, decodeURIComponent(url.password)]));
      }
      writes.push(command(["PSUBSCRIBE", pattern]));
      socket?.write(Buffer.concat(writes));
    });
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const parsed = parseResp(buffer);
        if (!parsed) break;
        buffer = buffer.subarray(parsed.next);
        if (parsed.value instanceof Error) {
          log("warn", "redis_subscription_error", { pattern, error: parsed.value.message });
          continue;
        }
        if (!Array.isArray(parsed.value)) continue;
        const [kind, _matchedPattern, channel, message] = parsed.value;
        if (kind === "pmessage" && typeof channel === "string" && typeof message === "string") {
          onMessage(channel, message);
        }
      }
    });
    const reconnect = (reason: string) => {
      if (closed || reconnectTimer) return;
      log("warn", "redis_subscription_disconnected", { pattern, reason });
      socket?.destroy();
      socket = null;
      buffer = Buffer.alloc(0);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2_000);
      reconnectTimer.unref?.();
    };
    socket.on("error", (error) => reconnect(error.message));
    socket.on("close", () => reconnect("socket_closed"));
  };

  connect();
  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.destroy();
  };
}
