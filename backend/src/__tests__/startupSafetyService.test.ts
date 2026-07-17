import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { assertPaperTradingOnly, validateStartupSafety } from "../services/startupSafetyService.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("startup paper-only safety", () => {
  it("accepts paper trading configuration", () => {
    process.env.TRADING_MODE = "paper";
    process.env.ALPACA_TRADING_ENV = "paper";
    process.env.ALPACA_TRADING_BASE_URL = "https://paper-api.alpaca.markets/v2";
    process.env.ALLOW_LIVE_BROKER_TRADING = "false";

    assert.doesNotThrow(() => validateStartupSafety());
    assert.doesNotThrow(() => assertPaperTradingOnly("test order"));
  });

  it("rejects live trading mode at startup", () => {
    process.env.TRADING_MODE = "live";
    process.env.ALPACA_TRADING_ENV = "paper";
    process.env.ALPACA_TRADING_BASE_URL = "https://paper-api.alpaca.markets/v2";
    process.env.ALLOW_LIVE_BROKER_TRADING = "false";

    assert.throws(() => validateStartupSafety(), /TRADING_MODE must be paper/);
  });

  it("rejects live Alpaca endpoints at startup", () => {
    process.env.TRADING_MODE = "paper";
    process.env.ALPACA_TRADING_ENV = "paper";
    process.env.ALPACA_TRADING_BASE_URL = "https://api.alpaca.markets/v2";
    process.env.ALLOW_LIVE_BROKER_TRADING = "false";

    assert.throws(() => validateStartupSafety(), /live Alpaca endpoint/);
  });

  it("blocks runtime order checks when environment drifts live", () => {
    process.env.TRADING_MODE = "paper";
    process.env.ALPACA_TRADING_ENV = "live";

    assert.throws(() => assertPaperTradingOnly("broker order"), /only supports paper trading/);
  });
});
