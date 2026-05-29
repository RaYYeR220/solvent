import { describe, it, expect } from "vitest";
import { headlineScores, type BenchmarkReport } from "../src/lib/benchmark";
import { loadBenchmark } from "../src/lib/benchmark.server";

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

  it("throws when the scenario name is unknown", async () => {
    const report = await loadBenchmark();
    expect(() => headlineScores(report, "nonexistent")).toThrow("scenario not found");
  });

  it("throws when a required strategy is missing from a scenario", () => {
    const partial: BenchmarkReport = {
      generatedAt: 0,
      scenarios: [{ name: "synthetic", description: "", results: [] }],
    };
    expect(() => headlineScores(partial, "synthetic")).toThrow("strategy not found");
  });
});
