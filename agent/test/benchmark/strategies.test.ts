import { describe, it, expect } from "vitest";
import { aiStrategy, hodlStrategy, createDelayedHuman } from "../../src/benchmark/strategies";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";
import { ActionType, Regime, type AgentPolicy } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const SAFE = 10n ** 6n;

function policy(): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6,
    allowedActions:
      (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
      (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD),
  };
}
function tick(over: Partial<ScenarioTick> = {}): ScenarioTick {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0, ...over };
}
const held = (): Portfolio => ({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });
const bridgedP = (): Portfolio => ({ assetBalance: 0n, safeBalance: 500n * SAFE, bridged: { collateral: 1000n * ONE, debt: 500n * SAFE } });

describe("aiStrategy", () => {
  it("CALM -> parks idle capital", () => {
    const d = aiStrategy.decide(tick({ marketPrice: ONE }), held(), policy());
    expect(d.plan.action).toBe(ActionType.PARK_YIELD);
  });
  it("EARLY + deep liquidity -> early exit", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(985), liquidityDepth: 10n ** 30n }), held(), policy());
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("early-exit");
  });
  it("EARLY + thin liquidity -> liquidity bridge", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(985), liquidityDepth: 1n }), held(), policy());
    expect(d.plan.action).toBe(ActionType.BRIDGE_VIA_LENDING);
    expect(d.reasonCode).toBe("liquidity-bridge");
  });
  it("TERMINAL + deep liquidity -> forced exit", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(800), liquidityDepth: 10n ** 30n }), held(), policy()); // 2000 bps >= terminal
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("terminal-exit");
  });
  it("bridged + re-peg (CALM) -> unwind", () => {
    const d = aiStrategy.decide(tick({ marketPrice: ONE }), bridgedP(), policy());
    expect(d.plan.action).toBe(ActionType.UNWIND_BRIDGE);
    expect(d.reasonCode).toBe("unwind-repeg");
    if (d.plan.action === ActionType.UNWIND_BRIDGE) {
      expect(d.plan.repayAmount).toBe(500n * SAFE);
      expect(d.plan.withdrawAmount).toBe(1000n * ONE);
    }
  });
  it("bridged + still depegged -> hold", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(915), liquidityDepth: 1n }), bridgedP(), policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("bridge-holding");
  });
  it("no asset and no bridge -> secured (nothing left to protect)", () => {
    const secured: Portfolio = { assetBalance: 0n, safeBalance: 985n * SAFE, bridged: null };
    const d = aiStrategy.decide(tick({ marketPrice: price(500) }), secured, policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("secured");
  });
});

describe("hodlStrategy", () => {
  it("never acts, whatever the regime", () => {
    const d = hodlStrategy.decide(tick({ marketPrice: price(100) }), held(), policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("hodl");
  });
});

describe("createDelayedHuman", () => {
  it("holds below the panic threshold", () => {
    const human = createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 });
    const d = human.decide(tick({ marketPrice: price(985) }), held(), policy()); // 150 bps < 500
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("hold-and-hope");
  });
  it("panic-sells everything only after the reaction latency, then stays out", () => {
    const human = createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 });
    let p = held();
    // tick over panic #1 -> still holds
    expect(human.decide(tick({ marketPrice: price(900) }), p, policy()).plan.action).toBe(ActionType.NONE); // 1000 bps, count 1
    // tick over panic #2 -> dumps all asset at the current price, ignoring slippage
    const sell = human.decide(tick({ marketPrice: price(780) }), p, policy()); // 2200 bps, count 2
    expect(sell.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(sell.reasonCode).toBe("panic-sell");
    if (sell.plan.action === ActionType.SWAP_TO_SAFE) {
      expect(sell.plan.amountIn).toBe(1000n * ONE);
      expect(sell.plan.amountOutMin).toBe(0n);
    }
    // once sold out (no asset), it does nothing further
    p = { assetBalance: 0n, safeBalance: 780n * SAFE, bridged: null };
    const after = human.decide(tick({ marketPrice: price(340) }), p, policy());
    expect(after.plan.action).toBe(ActionType.NONE);
    expect(after.reasonCode).toBe("sold-out");
  });
  it("accumulates panic ticks across a calm tick (no reset) before selling", () => {
    const human = createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 });
    const p = held();
    expect(human.decide(tick({ marketPrice: price(900) }), p, policy()).reasonCode).toBe("hold-and-hope"); // 1000 bps, count 1
    expect(human.decide(tick({ marketPrice: price(990) }), p, policy()).reasonCode).toBe("hold-and-hope"); // 100 bps < 500, count stays 1 (no reset)
    const sell = human.decide(tick({ marketPrice: price(880) }), p, policy()); // 1200 bps, count 2 -> sell
    expect(sell.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(sell.reasonCode).toBe("panic-sell");
  });
});
