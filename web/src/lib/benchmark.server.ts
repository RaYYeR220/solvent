import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkReport } from "./benchmark";

/** Load the snapshot from disk. Node-only — used by tests and server components. */
export async function loadBenchmark(): Promise<BenchmarkReport> {
  const path = join(process.cwd(), "public", "benchmark-report.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as BenchmarkReport;
}
