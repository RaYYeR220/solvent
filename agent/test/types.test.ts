import { describe, it, expect } from "vitest";
import { ActionType, Regime, isActionAllowed, divergenceBps, type AgentPolicy, type Signals } from "../src/types";

const policy: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6,
  allowedActions: (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.PARK_YIELD),
};

function sig(nav: bigint, market: bigint): Signals {
  return { navPrice: nav, marketPrice: market, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: 0, timestamp: 0 };
}

describe("isActionAllowed", () => {
  it("respects the bitmap and never allows NONE", () => {
    expect(isActionAllowed(policy, ActionType.SWAP_TO_SAFE)).toBe(true);
    expect(isActionAllowed(policy, ActionType.PARK_YIELD)).toBe(true);
    expect(isActionAllowed(policy, ActionType.BRIDGE_VIA_LENDING)).toBe(false);
    expect(isActionAllowed(policy, ActionType.NONE)).toBe(false);
  });
});

describe("divergenceBps", () => {
  it("is zero when market >= nav (no depeg)", () => {
    expect(divergenceBps(sig(10n ** 18n, 10n ** 18n))).toBe(0);
    expect(divergenceBps(sig(10n ** 18n, 2n * 10n ** 18n))).toBe(0);
  });
  it("measures the downward gap in bps of nav", () => {
    // nav 1.00, market 0.95 -> 500 bps
    expect(divergenceBps(sig(10n ** 18n, 95n * 10n ** 16n))).toBe(500);
  });
});
