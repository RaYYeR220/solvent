import { describe, it, expect } from "vitest";
import { assessRegime } from "../src/engine/assessRegime";
import { Regime, type AgentPolicy, type Signals } from "../src/types";

const p: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: 0,
};

const ONE = 10n ** 18n;
function s(marketFractionBps: number, oracleDivBps = 0): Signals {
  // marketPrice = nav * (1 - marketFractionBps/10000)
  const market = (ONE * BigInt(10000 - marketFractionBps)) / 10000n;
  return { navPrice: ONE, marketPrice: market, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: oracleDivBps, timestamp: 0 };
}

describe("assessRegime", () => {
  it("CALM when divergence below watch threshold", () => {
    expect(assessRegime(s(10), p)).toBe(Regime.CALM);
  });
  it("WATCH between watch and early thresholds", () => {
    expect(assessRegime(s(30), p)).toBe(Regime.WATCH);
  });
  it("EARLY_DEPEG between early and terminal thresholds", () => {
    expect(assessRegime(s(100), p)).toBe(Regime.EARLY_DEPEG);
  });
  it("TERMINAL_DEPEG at or above terminal threshold", () => {
    expect(assessRegime(s(500), p)).toBe(Regime.TERMINAL_DEPEG);
    expect(assessRegime(s(900), p)).toBe(Regime.TERMINAL_DEPEG);
  });
  it("does NOT escalate on untrusted (high oracle divergence) data -> WATCH", () => {
    expect(assessRegime(s(900, 300), p)).toBe(Regime.WATCH);
  });
  it("CALM when market above nav (premium, not a depeg)", () => {
    const premium: Signals = { ...s(0), marketPrice: ONE + ONE / 100n };
    expect(assessRegime(premium, p)).toBe(Regime.CALM);
  });
});
