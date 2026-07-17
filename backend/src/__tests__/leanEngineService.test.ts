import assert from "node:assert/strict";
import test from "node:test";

import { getLeanEngineStatus } from "../services/lean/leanEngineService.js";

test("LEAN status remains paper-only when gateway is absent", async () => {
  const status = await getLeanEngineStatus();
  assert.equal(status.mode, "PAPER_ONLY");
  assert.equal(status.provider, "QuantConnect LEAN");
  assert.equal(status.capabilities.find((item) => item.key === "live-money")?.enabled, false);
  assert.ok(status.architecture.includes("Portfolio accounting"));
});
