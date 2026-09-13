import { describe, expect, it } from "vitest";

import {
  BOT_STATUSES,
  BOT_EXECUTION_MODES,
  isBotStatus,
  isBotExecutionMode,
} from "../types/bot.js";

describe("BOT_STATUSES", () => {
  it("contains the full roadmap lifecycle", () => {
    expect(BOT_STATUSES).toEqual([
      "DRAFT",
      "STOPPED",
      "STARTING",
      "RUNNING",
      "PAUSED",
      "STOPPING",
      "ERROR",
    ]);
  });
});

describe("isBotStatus", () => {
  it("accepts valid statuses", () => {
    expect(isBotStatus("RUNNING")).toBe(true);
    expect(isBotStatus("STOPPED")).toBe(true);
    expect(isBotStatus("ERROR")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isBotStatus("running")).toBe(false);
    expect(isBotStatus("ACTIVE")).toBe(false);
    expect(isBotStatus("")).toBe(false);
  });
});

describe("BOT_EXECUTION_MODES", () => {
  it("contains backtest, paper, demo, testnet, live", () => {
    expect(BOT_EXECUTION_MODES).toEqual([
      "BACKTEST",
      "PAPER",
      "DEMO",
      "TESTNET",
      "LIVE",
    ]);
  });
});

describe("isBotExecutionMode", () => {
  it("accepts valid modes", () => {
    expect(isBotExecutionMode("PAPER")).toBe(true);
    expect(isBotExecutionMode("LIVE")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isBotExecutionMode("paper")).toBe(false);
    expect(isBotExecutionMode("PROD")).toBe(false);
  });
});