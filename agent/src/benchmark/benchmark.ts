import type { AgentPolicy } from "../types";
import type { BenchmarkReport, Scenario, Strategy } from "./types";
import { runScenario } from "./run";
import { aiStrategy, hodlStrategy, createDelayedHuman } from "./strategies";
import { transientScenario, terminalScenario } from "./scenarios";

/** Fresh strategy set per scenario (delayed-human is stateful, so it must not be shared). */
function strategiesFor(): Strategy[] {
  return [aiStrategy, hodlStrategy, createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 })];
}

/** Run every strategy over both canonical scenarios and assemble the scoreboard. */
export function runBenchmark(policy: AgentPolicy): BenchmarkReport {
  const scenarios: Scenario[] = [transientScenario, terminalScenario];
  return {
    scenarios: scenarios.map((sc) => ({
      name: sc.name,
      description: sc.description,
      results: strategiesFor().map((st) => runScenario(sc, st, policy)),
    })),
  };
}
