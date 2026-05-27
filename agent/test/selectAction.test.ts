import { describe, it, expect } from "vitest";
import { selectAction, minSafeOut, maxBorrow } from "../src/engine/selectAction";
import { ActionType, Regime, type AgentPolicy, type Signals } from "../src/types";

const ONE = 10n ** 18n;

function policy(allowed: number): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
    maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: allowed,
  };
}
const ALL =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

function signals(over: Partial<Signals> = {}): Signals {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, assetBalance: 100n * ONE, oracleDivergenceBps: 0, timestamp: 0, ...over };
}

describe("minSafeOut / maxBorrow", () => {
  it("mirror the on-chain decimal-adjusted formulas", () => {
    // 100e18 asset, 3% slippage, 18->6 decimals -> 97e6
    expect(minSafeOut(100n * ONE, policy(ALL))).toBe(97n * 10n ** 6n);
    // 200e18 collateral, 50% LTV -> 100e6
    expect(maxBorrow(200n * ONE, policy(ALL))).toBe(100n * 10n ** 6n);
  });
});

describe("selectAction", () => {
  it("CALM -> park yield when allowed and balance > 0", () => {
    const d = selectAction(Regime.CALM, signals(), policy(ALL));
    expect(d.plan.action).toBe(ActionType.PARK_YIELD);
    expect(d.reasonCode).toBe("park-calm");
  });
  it("CALM with park disallowed -> NONE", () => {
    const d = selectAction(Regime.CALM, signals(), policy(1 << ActionType.SWAP_TO_SAFE));
    expect(d.plan.action).toBe(ActionType.NONE);
  });
  it("WATCH -> no action (observation)", () => {
    const d = selectAction(Regime.WATCH, signals(), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("watch");
  });
  it("EARLY_DEPEG with enough liquidity -> early exit (swap)", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 100n * ONE }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("early-exit");
    if (d.plan.action === ActionType.SWAP_TO_SAFE) {
      expect(d.plan.amountIn).toBe(100n * ONE);
      expect(d.plan.amountOutMin).toBe(97n * 10n ** 6n);
    }
  });
  it("EARLY_DEPEG when illiquid -> liquidity bridge", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 1n }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.BRIDGE_VIA_LENDING);
    expect(d.reasonCode).toBe("liquidity-bridge");
    if (d.plan.action === ActionType.BRIDGE_VIA_LENDING) {
      expect(d.plan.collateralAmount).toBe(100n * ONE);
      expect(d.plan.borrowAmount).toBe(50n * 10n ** 6n); // 50% of 100 units at 1:1, decimal-adjusted
    }
  });
  it("EARLY_DEPEG illiquid with no bridge allowed -> NONE protect-failed", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 1n }), policy(1 << ActionType.SWAP_TO_SAFE));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-illiquid");
  });
  it("TERMINAL_DEPEG with liquidity -> forced exit", () => {
    const d = selectAction(Regime.TERMINAL_DEPEG, signals({ liquidityDepth: 100n * ONE }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("terminal-exit");
  });
  it("TERMINAL_DEPEG illiquid -> NONE protect-failed (no bridge in terminal)", () => {
    const d = selectAction(Regime.TERMINAL_DEPEG, signals({ liquidityDepth: 1n }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-illiquid");
  });
  it("EARLY_DEPEG with zero balance -> NONE protect-failed-illiquid", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ assetBalance: 0n, liquidityDepth: 100n * ONE }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-illiquid");
  });
  it("EARLY_DEPEG with dust balance (amounts round to 0) -> NONE protect-failed-dust", () => {
    // 1000 wei of an 18-dec asset: minSafeOut/maxBorrow truncate to 0 at 6-dec safe asset
    const d = selectAction(Regime.EARLY_DEPEG, signals({ assetBalance: 1000n, liquidityDepth: 10n ** 30n }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-dust");
  });
});
