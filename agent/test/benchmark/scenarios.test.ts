import { describe, it, expect } from "vitest";
import { benchmarkPolicy, transientScenario, terminalScenario } from "../../src/benchmark/scenarios";
import { divergenceBps } from "../../src/types";

const ONE = 10n ** 18n;

describe("benchmarkPolicy", () => {
  it("uses the balanced thresholds the scenarios are tuned against", () => {
    const p = benchmarkPolicy();
    expect(p.earlyDivergenceBps).toBe(50);
    expect(p.terminalDivergenceBps).toBe(1000);
    expect(p.maxBridgeLTVBps).toBe(5000);
    expect(p.assetDecimals).toBe(18);
    expect(p.safeDecimals).toBe(6);
  });
});

describe("transientScenario", () => {
  it("holds NAV at par and fully recovers in market price", () => {
    expect(transientScenario.ticks.every((t) => t.navPrice === ONE)).toBe(true);
    expect(transientScenario.ticks[0]!.marketPrice).toBe(ONE);
    expect(transientScenario.ticks.at(-1)!.marketPrice).toBe(ONE);
  });
  it("never crosses the terminal threshold (stays in early-depeg territory)", () => {
    const maxDiv = Math.max(...transientScenario.ticks.map((t) => divergenceBps({ ...t, assetBalance: 0n })));
    expect(maxDiv).toBeGreaterThanOrEqual(benchmarkPolicy().earlyDivergenceBps);
    expect(maxDiv).toBeLessThan(benchmarkPolicy().terminalDivergenceBps);
  });
  it("has thin liquidity so exit is infeasible and the bridge is forced", () => {
    expect(transientScenario.ticks.every((t) => t.liquidityDepth < transientScenario.initialAssetBalance)).toBe(true);
  });
});

describe("terminalScenario", () => {
  it("collapses and never recovers", () => {
    expect(terminalScenario.ticks[0]!.marketPrice).toBe(ONE);
    expect(terminalScenario.ticks.at(-1)!.marketPrice).toBeLessThan(ONE / 5n); // below $0.20
  });
  it("has deep liquidity early so an early exit is possible before it dries", () => {
    expect(terminalScenario.ticks[1]!.liquidityDepth).toBeGreaterThanOrEqual(terminalScenario.initialAssetBalance);
    expect(terminalScenario.ticks.at(-1)!.liquidityDepth).toBeLessThan(terminalScenario.initialAssetBalance);
  });
});
