import { describe, it, expect } from "vitest";
import { loadBenchmark, headlineScores } from "../src/lib/benchmark";

describe("benchmark reader", () => {
  it("loads the JSON snapshot with both scenarios", async () => {
    const report = await loadBenchmark();
    expect(report.scenarios).toHaveLength(2);
    expect(report.scenarios[0].name).toBe("transient-depeg");
    expect(report.scenarios[1].name).toBe("terminal-collapse");
  });

  it("extracts terminal-collapse headline scores in percent", async () => {
    const report = await loadBenchmark();
    const headline = headlineScores(report, "terminal-collapse");
    expect(headline.ai).toBeGreaterThanOrEqual(97);
    expect(headline.human).toBeGreaterThan(70);
    expect(headline.human).toBeLessThan(90);
    expect(headline.hodl).toBeGreaterThanOrEqual(9);
    expect(headline.hodl).toBeLessThanOrEqual(12);
  });
});
