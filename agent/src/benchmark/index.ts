import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BenchmarkReport } from "./types";
import { runBenchmark } from "./benchmark";
import { benchmarkPolicy } from "./scenarios";

/** JSON with bigints rendered as decimal strings, plus a generatedAt stamp. */
export function toScoreboardJson(report: BenchmarkReport, generatedAt: number): string {
  return JSON.stringify(
    { generatedAt, scenarios: report.scenarios },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

/** CLI: run the benchmark and write the scoreboard for the dashboard to read. */
export function main(): void {
  const report = runBenchmark(benchmarkPolicy());
  const json = toScoreboardJson(report, Math.floor(Date.now() / 1000));
  writeFileSync("benchmark-report.json", json);
  for (const sc of report.scenarios) {
    const summary = sc.results.map((r) => `${r.strategyName}=${(r.pctPreservedBps / 100).toFixed(1)}%`).join("  ");
    // eslint-disable-next-line no-console
    console.log(`${sc.name}: ${summary}`);
  }
}

// Run only when invoked directly (e.g. `tsx src/benchmark/index.ts`), not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
