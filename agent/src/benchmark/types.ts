import type { ActionType, Regime, Signals, AgentPolicy, Decision } from "../types";

/** One step of a depeg trajectory. The portfolio supplies assetBalance, so it is omitted here. */
export type ScenarioTick = Omit<Signals, "assetBalance">;

/** A depeg trajectory plus the capital and decimals the run starts with. */
export interface Scenario {
  name: string;
  description: string;
  assetDecimals: number;
  safeDecimals: number;
  initialAssetBalance: bigint; // asset-native units
  ticks: ScenarioTick[];
}

/** A vault's holdings during a simulation, all in token-native units. */
export interface Portfolio {
  assetBalance: bigint; // free at-risk asset
  safeBalance: bigint; // safe-asset holdings
  bridged: { collateral: bigint; debt: bigint } | null; // open lending bridge, if any
}

export interface DecisionLogEntry {
  timestamp: number;
  regime: Regime;
  action: ActionType;
  reasonCode: string;
  valueAfter: bigint; // mark-to-market in safe-asset units after applying the action
}

export interface ScenarioResult {
  scenarioName: string;
  strategyName: string;
  initialValue: bigint; // safe-asset units, marked at the first tick
  finalValue: bigint; // safe-asset units, marked at the last tick
  pctPreservedBps: number; // finalValue / initialValue, in bps (10000 = 100%)
  log: DecisionLogEntry[];
}

export interface BenchmarkReport {
  scenarios: Array<{ name: string; description: string; results: ScenarioResult[] }>;
}

/** A decision-maker: given current market + its own portfolio, choose a policy-bounded action. */
export interface Strategy {
  name: string;
  decide(tick: ScenarioTick, portfolio: Portfolio, policy: AgentPolicy): Decision;
}
