import { describe, it, expect } from "vitest";
import { applyAction } from "../../src/benchmark/portfolio";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";
import { ActionType } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const tick = (milli: number): ScenarioTick => ({ navPrice: ONE, marketPrice: price(milli), liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0 });
const held = (): Portfolio => ({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });

describe("applyAction", () => {
  it("NONE leaves the portfolio unchanged", () => {
    expect(applyAction(held(), { action: ActionType.NONE }, tick(1000), 18, 6)).toEqual(held());
  });

  it("PARK_YIELD keeps full asset exposure (no economic change)", () => {
    expect(applyAction(held(), { action: ActionType.PARK_YIELD, amount: 1000n * ONE }, tick(1000), 18, 6)).toEqual(held());
  });

  it("SWAP_TO_SAFE converts asset to safe at the tick's market price", () => {
    const out = applyAction(held(), { action: ActionType.SWAP_TO_SAFE, amountIn: 1000n * ONE, amountOutMin: 0n }, tick(985), 18, 6);
    expect(out).toEqual({ assetBalance: 0n, safeBalance: 985n * 10n ** 6n, bridged: null });
  });

  it("BRIDGE_VIA_LENDING moves asset to collateral and credits borrowed safe", () => {
    const out = applyAction(held(), { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 1000n * ONE, borrowAmount: 500n * 10n ** 6n }, tick(915), 18, 6);
    expect(out).toEqual({ assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } });
  });

  it("UNWIND_BRIDGE repays debt and returns collateral to the asset balance", () => {
    const bridged: Portfolio = { assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } };
    const out = applyAction(bridged, { action: ActionType.UNWIND_BRIDGE, repayAmount: 500n * 10n ** 6n, withdrawAmount: 1000n * ONE }, tick(1000), 18, 6);
    expect(out).toEqual({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });
  });
});
