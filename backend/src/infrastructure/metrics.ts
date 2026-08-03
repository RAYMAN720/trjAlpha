import type { NextFunction, Request, Response } from "express";

const counters = new Map<string, number>();
const startedAt = Date.now();

export function incrementMetric(name: string, value = 1) {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.on("finish", () => {
    incrementMetric("http_requests_total");
    incrementMetric(`http_status_${res.statusCode}_total`);
    const duration = performance.now() - start;
    const latencyBucket = duration < 100 ? "lt_100ms" : duration < 500 ? "lt_500ms" : duration < 2000 ? "lt_2s" : "gte_2s";
    incrementMetric(`http_latency_${latencyBucket}_total`);
    if (req.path.includes("/orders")) incrementMetric("order_api_requests_total");
  });
  next();
}

export function prometheusMetrics() {
  const lines = [
    "# HELP tradepilot_uptime_seconds Process uptime in seconds",
    "# TYPE tradepilot_uptime_seconds gauge",
    `tradepilot_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`
  ];
  for (const [name, value] of [...counters.entries()].sort()) {
    lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
  }
  return `${lines.join("\n")}\n`;
}
