import { describe, it, expect } from "vitest";
import { gatherSignals } from "../src/signals";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../src/adapters/mocks";

const ONE = 10n ** 18n;

describe("gatherSignals", () => {
  it("assembles a Signals snapshot from the sources", async () => {
    const s = await gatherSignals({
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(95n * 10n ** 16n),
      liquidity: new MockLiquiditySource(42n * ONE),
      position: new MockPositionSource(7n * ONE),
    });
    expect(s.navPrice).toBe(ONE);
    expect(s.marketPrice).toBe(95n * 10n ** 16n);
    expect(s.liquidityDepth).toBe(42n * ONE);
    expect(s.assetBalance).toBe(7n * ONE);
    expect(s.oracleDivergenceBps).toBe(0); // no cross-check source
    expect(s.timestamp).toBeGreaterThan(0);
  });

  it("computes oracle divergence in bps between primary and cross-check price", async () => {
    const s = await gatherSignals({
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(100n * 10n ** 16n), // 1.00
      priceCrossCheck: new MockPriceSource(98n * 10n ** 16n), // 0.98 -> 200 bps spread
      liquidity: new MockLiquiditySource(0n),
      position: new MockPositionSource(0n),
    });
    expect(s.oracleDivergenceBps).toBe(200);
  });
});
