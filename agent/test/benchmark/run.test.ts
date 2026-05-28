import { describe, it, expect } from "vitest";
import { runScenario } from "../../src/benchmark/run";
import { hodlStrategy } from "../../src/benchmark/strategies";
import type { Scenario, Strategy } from "../../src/benchmark/types";
import { ActionType, Regime, type AgentPolicy } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const SAFE = 10n ** 6n;

function policy(): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: 0,
  };
}

// A 3-tick collapse: $1.00 -> $0.50 -> $0.20, deep liquidity throughout.
const collapse: Scenario = {
  name: "mini-collapse", description: "test fixture", assetDecimals: 18, safeDecimals: 6,
  initialAssetBalance: 1000n * ONE,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(500), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 1 },
    { navPrice: ONE, marketPrice: price(200), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 2 },
  ],
};

describe("runScenario", () => {
  it("HODL rides the collapse all the way down", () => {
    const r = runScenario(collapse, hodlStrategy, policy());
    expect(r.scenarioName).toBe("mini-collapse");
    expect(r.strategyName).toBe("passive-hodl");
    expect(r.initialValue).toBe(1000n * SAFE); // $1000 at $1.00
    expect(r.finalValue).toBe(200n * SAFE); // $200 at $0.20
    expect(r.pctPreservedBps).toBe(2000); // 20%
    expect(r.log).toHaveLength(3);
  });

  it("a swap-at-first-tick strategy locks in par and ignores the collapse", () => {
    const exitNow: Strategy = {
      name: "exit-now",
      decide(_tick, p): { regime: Regime; plan: { action: ActionType.SWAP_TO_SAFE; amountIn: bigint; amountOutMin: bigint } | { action: ActionType.NONE }; reasonCode: string } {
        if (p.assetBalance > 0n) {
          return { regime: Regime.EARLY_DEPEG, plan: { action: ActionType.SWAP_TO_SAFE, amountIn: p.assetBalance, amountOutMin: 0n }, reasonCode: "exit" };
        }
        return { regime: Regime.CALM, plan: { action: ActionType.NONE }, reasonCode: "done" };
      },
    };
    const r = runScenario(collapse, exitNow, policy());
    expect(r.finalValue).toBe(1000n * SAFE); // sold all at $1.00 on tick 0
    expect(r.pctPreservedBps).toBe(10000);
    expect(r.log[0]!.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(r.log[0]!.valueAfter).toBe(1000n * SAFE); // post-action: safe held, immune to the collapse
  });

  it("throws on an empty scenario", () => {
    const empty: Scenario = { ...collapse, ticks: [] };
    expect(() => runScenario(empty, hodlStrategy, policy())).toThrow();
  });
});
