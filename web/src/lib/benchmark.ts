export interface DecisionLogEntry {
  timestamp: number;
  regime: number;
  action: number;
  reasonCode: string;
  valueAfter: string; // bigint serialized as decimal string
}

export interface ScenarioResult {
  scenarioName: string;
  strategyName: string;
  initialValue: string;
  finalValue: string;
  pctPreservedBps: number;
  log: DecisionLogEntry[];
}

export interface BenchmarkScenario {
  name: string;
  description: string;
  results: ScenarioResult[];
}

export interface BenchmarkReport {
  generatedAt: number;
  scenarios: BenchmarkScenario[];
}

export interface HeadlineScores {
  ai: number; // percent
  human: number;
  hodl: number;
}

const STRATEGY_KEYS = {
  ai: "solvent-ai",
  human: "delayed-human",
  hodl: "passive-hodl",
} as const;

/** Browser fetch variant — used inside React components. */
export async function fetchBenchmark(): Promise<BenchmarkReport> {
  const res = await fetch("/benchmark-report.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`benchmark fetch failed: ${res.status}`);
  return (await res.json()) as BenchmarkReport;
}

/** Pull a scenario's three strategy pctPreservedBps and convert to percent. */
export function headlineScores(report: BenchmarkReport, scenarioName: string): HeadlineScores {
  const scenario = report.scenarios.find((s) => s.name === scenarioName);
  if (!scenario) throw new Error(`scenario not found: ${scenarioName}`);
  const pick = (name: string): number => {
    const r = scenario.results.find((x) => x.strategyName === name);
    if (!r) throw new Error(`strategy not found in ${scenarioName}: ${name}`);
    return r.pctPreservedBps / 100;
  };
  return { ai: pick(STRATEGY_KEYS.ai), human: pick(STRATEGY_KEYS.human), hodl: pick(STRATEGY_KEYS.hodl) };
}
