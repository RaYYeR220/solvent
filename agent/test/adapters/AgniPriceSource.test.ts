import { describe, expect, it, vi } from "vitest";
import { AgniPriceSource } from "../../src/adapters/AgniPriceSource";
import type { Address } from "../../src/types";

const QUOTER: Address = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb";
const USDT0: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const USDC: Address = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

function fakeClient(amountOut: bigint) {
  return {
    simulateContract: vi.fn().mockResolvedValue({
      result: [amountOut, 0n, 0, 0n],
    }),
  } as any;
}

describe("AgniPriceSource", () => {
  it("returns amountOut scaled to 1e18 given amountIn 1e18 (same decimals)", async () => {
    const c = fakeClient(999_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 6, 6);
    await expect(src.getMarketPrice()).resolves.toBe(999_000_000_000_000_000n);
  });

  it("uses fee tier 500 (0.05%) when configured", async () => {
    const c = fakeClient(1_000_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 6, 6);
    await src.getMarketPrice();
    expect(c.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: QUOTER,
        functionName: "quoteExactInputSingle",
        args: [expect.objectContaining({ fee: 500 })],
      })
    );
  });

  it("normalises across decimal mismatches (asset 18 dec -> safe 6 dec)", async () => {
    const c = fakeClient(999_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 18, 6);
    await expect(src.getMarketPrice()).resolves.toBe(999_000_000_000_000_000n);
  });

  it("throws clear error when decimals out of range", () => {
    expect(() => new AgniPriceSource({} as any, QUOTER, USDT0, USDC, 500, 6, 19))
      .toThrow(/safeDecimals must be in \[0, 18\], got 19/);
    expect(() => new AgniPriceSource({} as any, QUOTER, USDT0, USDC, 500, 19, 6))
      .toThrow(/assetDecimals must be in \[0, 18\], got 19/);
  });

  it("falls back to nominal 1e18 when the quoter reverts (missing or empty pool)", async () => {
    const c = {
      simulateContract: vi.fn().mockRejectedValue(new Error("execution reverted")),
    } as any;
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 100, 6, 6);
    await expect(src.getMarketPrice()).resolves.toBe(1_000_000_000_000_000_000n);
  });
});
