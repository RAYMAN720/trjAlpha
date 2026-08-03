import type { NextFunction, Request, Response } from "express";
import { redis } from "./redisClient.js";

const memory = new Map<string, { count: number; expiresAt: number }>();

type Options = {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
  identity?: (req: Request) => string;
};

export function rateLimit(options: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = options.identity?.(req) || req.ip || "unknown";
    const bucket = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const key = `${options.keyPrefix}:${identity}:${bucket}`;
    try {
      let count: number;
      if (redis.configured()) {
        count = Number(await redis.incr(key) ?? 1);
        if (count === 1) await redis.expire(key, options.windowSeconds + 2);
      } else {
        const now = Date.now();
        const current = memory.get(key);
        if (!current || current.expiresAt <= now) {
          memory.set(key, { count: 1, expiresAt: now + options.windowSeconds * 1000 });
          count = 1;
        } else {
          current.count += 1; count = current.count;
        }
        if (memory.size > 10_000) {
          for (const [memoryKey, item] of memory) if (item.expiresAt <= now) memory.delete(memoryKey);
        }
      }
      res.setHeader("X-RateLimit-Limit", String(options.max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.max - count)));
      if (count > options.max) {
        res.setHeader("Retry-After", String(options.windowSeconds));
        return res.status(429).json({ error: "Too many requests. Try again shortly." });
      }
      return next();
    } catch {
      return next(); // Limiter infrastructure may fail open; trading risk never does.
    }
  };
}
