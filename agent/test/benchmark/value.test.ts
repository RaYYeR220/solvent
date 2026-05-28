import { describe, it, expect } from "vitest";
import { assetToSafe, markToMarket } from "../../src/benchmark/value";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n; // milli = price * 1000

function tick(over: Partial<ScenarioTick> = {}): ScenarioTick {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0, ...over };
}

describe("assetToSafe", () => {
  it("converts asset-native (18dec) to safe-native (6dec) at a given 1e18 price", () => {
    expect(assetToSafe(1000n * ONE, ONE, 18, 6)).toBe(1000n * 10n ** 6n); // $1.00
    expect(assetToSafe(1000n * ONE, price(985), 18, 6)).toBe(985n * 10n ** 6n); // $0.985
  });
});

describe("markToMarket", () => {
  it("values free asset at market price", () => {
    const p: Portfolio = { assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null };
    expect(markToMarket(p, tick(), 18, 6)).toBe(1000n * 10n ** 6n);
  });
  it("counts safe holdings at face value regardless of price", () => {
    const p: Portfolio = { assetBalance: 0n, safeBalance: 915n * 10n ** 6n, bridged: null };
    expect(markToMarket(p, tick({ marketPrice: price(100) }), 18, 6)).toBe(915n * 10n ** 6n);
  });
  it("nets bridge equity = collateral value − debt", () => {
    const p: Portfolio = { assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } };
    // at $0.915: safe 500 + (915 − 500) = 915
    expect(markToMarket(p, tick({ marketPrice: price(915) }), 18, 6)).toBe(915n * 10n ** 6n);
  });
});
