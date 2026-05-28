import { describe, it, expect } from "vitest";
import { runBenchmark } from "../../src/benchmark/benchmark";
import { benchmarkPolicy } from "../../src/benchmark/scenarios";
import type { ScenarioResult } from "../../src/benchmark/types";

function pick(report: ReturnType<typeof runBenchmark>, scenario: string) {
  const sc = report.scenarios.find((s) => s.name === scenario);
  if (!sc) throw new Error(`missing scenario ${scenario}`);
  const by = (name: string): ScenarioResult => {
    const r = sc.results.find((x) => x.strategyName === name);
    if (!r) throw new Error(`missing strategy ${name}`);
    return r;
  };
  return { ai: by("solvent-ai"), hodl: by("passive-hodl"), human: by("delayed-human") };
}

describe("runBenchmark", () => {
  const report = runBenchmark(benchmarkPolicy());

  it("covers both canonical scenarios with all three strategies", () => {
    expect(report.scenarios.map((s) => s.name).sort()).toEqual(["terminal-collapse", "transient-depeg"]);
    for (const s of report.scenarios) {
      expect(s.results.map((r) => r.strategyName).sort()).toEqual(["delayed-human", "passive-hodl", "solvent-ai"]);
    }
  });

  it("terminal: AI early-exits near par; human reacts late; HODL is wiped out", () => {
    const { ai, hodl, human } = pick(report, "terminal-collapse");
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(9000); // ~98.5%
    expect(hodl.pctPreservedBps).toBeLessThanOrEqual(1500); // ~10%
    expect(ai.finalValue).toBeGreaterThan(human.finalValue);
    expect(human.finalValue).toBeGreaterThan(hodl.finalValue);
  });

  it("transient: AI matches the best-case HODL recovery while the human crystallizes the dip loss", () => {
    const { ai, hodl, human } = pick(report, "transient-depeg");
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(9900); // fully recovered
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(hodl.pctPreservedBps - 50); // within 0.5% of HODL
    expect(ai.finalValue).toBeGreaterThan(human.finalValue); // human sold at the bottom
  });

  it("AI uses the bridge on the transient (thin pool) and an exit on the terminal (deep pool early)", () => {
    const tr = pick(report, "transient-depeg").ai;
    const te = pick(report, "terminal-collapse").ai;
    expect(tr.log.some((e) => e.reasonCode === "liquidity-bridge")).toBe(true);
    expect(tr.log.some((e) => e.reasonCode === "unwind-repeg")).toBe(true);
    expect(te.log.some((e) => e.reasonCode === "early-exit")).toBe(true);
  });
});
