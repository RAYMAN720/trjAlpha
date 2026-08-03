import net from "node:net";
import tls from "node:tls";

function encode(args: Array<string | number>) {
  const chunks = [`*${args.length}\r\n`];
  for (const arg of args) {
    const value = String(arg);
    chunks.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }
  return chunks.join("");
}

function parse(buffer: string): unknown {
  const type = buffer[0];
  const lineEnd = buffer.indexOf("\r\n");
  const line = buffer.slice(1, lineEnd);
  if (type === "+") return line;
  if (type === "-") throw new Error(`Redis error: ${line}`);
  if (type === ":") return Number(line);
  if (type === "$" && Number(line) === -1) return null;
  if (type === "$") {
    const length = Number(line);
    return buffer.slice(lineEnd + 2, lineEnd + 2 + length);
  }
  return line;
}

async function command(args: Array<string | number>) {
  const rawUrl = process.env.REDIS_URL?.trim();
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const auth = url.password ? ["AUTH", decodeURIComponent(url.password)] : null;

  return new Promise<unknown>((resolve, reject) => {
    const socket = url.protocol === "rediss:"
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port });
    let data = "";
    let authenticated = !auth;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Redis command timed out.")); }, 1500);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(encode(auth ?? args)));
    socket.on("data", (chunk) => {
      data += chunk;
      if (!data.includes("\r\n")) return;
      try {
        const result = parse(data);
        data = "";
        if (!authenticated) {
          authenticated = true;
          socket.write(encode(args));
          return;
        }
        clearTimeout(timer);
        socket.end();
        resolve(result);
      } catch (error) {
        clearTimeout(timer); socket.destroy(); reject(error);
      }
    });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

export const redis = {
  configured: () => Boolean(process.env.REDIS_URL?.trim()),
  get: async (key: string) => command(["GET", key]) as Promise<string | null>,
  setEx: async (key: string, seconds: number, value: string) => command(["SETEX", key, seconds, value]),
  incr: async (key: string) => command(["INCR", key]) as Promise<number | null>,
  expire: async (key: string, seconds: number) => command(["EXPIRE", key, seconds]),
  publish: async (channel: string, value: string) => command(["PUBLISH", channel, value]),
  ping: async () => command(["PING"])
};
