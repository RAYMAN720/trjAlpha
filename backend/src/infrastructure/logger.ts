export function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) {
  const record = { ts: new Date().toISOString(), level, service: "tradepilot-api", message, ...fields };
  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}
