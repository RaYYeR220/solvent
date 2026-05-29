/** A scenario is a sequence of per-tick "world states" the forkReplay script
 *  applies before each tick by manipulating oracle/pool storage on the fork.
 *  All prices are 1e18-scaled. */
export interface ScenarioStep {
  tick: number;
  oracleNav: bigint;
  marketPrice: bigint;
  liquidityDepth: bigint;
}

export interface Scenario {
  name: string;
  steps: readonly ScenarioStep[];
}

const ONE = 1_000_000_000_000_000_000n;
const DEEP = 10n ** 12n;

export const transientDepegScenario: Scenario = {
  name: "transient-depeg",
  steps: [
    { tick: 0, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP },
    { tick: 1, oracleNav: ONE, marketPrice: 999_500_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 2, oracleNav: ONE, marketPrice: 985_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 3, oracleNav: ONE, marketPrice: 960_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 4, oracleNav: ONE, marketPrice: 950_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 5, oracleNav: ONE, marketPrice: 970_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 6, oracleNav: ONE, marketPrice: 990_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 7, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP },
  ],
};

export const terminalCollapseScenario: Scenario = {
  name: "terminal-collapse",
  steps: [
    { tick: 0, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP },
    { tick: 1, oracleNav: ONE, marketPrice: 998_000_000_000_000_000n,     liquidityDepth: DEEP }, // CALM (20 bps)
    { tick: 2, oracleNav: ONE, marketPrice: 850_000_000_000_000_000n,     liquidityDepth: DEEP }, // FLASH CRASH → TERMINAL (1500 bps)
    { tick: 3, oracleNav: ONE, marketPrice: 700_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 4, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 5, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 6, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 7, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
  ],
};

export const scenarios = [transientDepegScenario, terminalCollapseScenario];
