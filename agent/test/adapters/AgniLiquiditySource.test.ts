import { describe, expect, it, vi } from "vitest";
import { AgniLiquiditySource } from "../../src/adapters/AgniLiquiditySource";
import type { Address } from "../../src/types";

const QUOTER: Address = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb";
const USDT0: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const USDC: Address = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

function fakeClient(quotes: Record<string, bigint>) {
  return {
    simulateContract: vi.fn().mockImplementation(({ args }) => {
      const key = (args[0].amountIn as bigint).toString();
      const out = quotes[key] ?? 0n;
      return Promise.resolve({ result: [out, 0n, 0, 0n] });
    }),
  } as any;
}

describe("AgniLiquiditySource", () => {
  it("returns largest probe that stays within slippage", async () => {
    const c = fakeClient({
      "1000000": 1_000_000n,
      "1000000000": 990_000_000n,
      "1000000000000": 500_000_000_000n,
    });
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300,
      [1_000_000n, 1_000_000_000n, 1_000_000_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(1_000_000_000n);
  });

  it("returns 0 when even the smallest probe fails slippage", async () => {
    const c = fakeClient({ "1000000": 500_000n });
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300, [1_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(0n);
  });

  it("returns 0 when probeSizes is empty (live-mainnet stub mode)", async () => {
    const c = { simulateContract: vi.fn() } as any;
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300, [],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(0n);
    expect(c.simulateContract).not.toHaveBeenCalled();
  });

  it("treats quoter revert as failed probe (returns next-smaller valid)", async () => {
    const c = {
      simulateContract: vi.fn().mockImplementation(({ args }) => {
        if ((args[0].amountIn as bigint) === 1_000_000_000n) {
          return Promise.reject(new Error("INSUFFICIENT_LIQUIDITY"));
        }
        return Promise.resolve({ result: [1_000_000n, 0n, 0, 0n] });
      }),
    } as any;
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300,
      [1_000_000n, 1_000_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(1_000_000n);
  });

  it("throws clear error when decimals out of range", () => {
    expect(() => new AgniLiquiditySource({} as any, QUOTER, USDT0, USDC, 500, 6, 19, 300, []))
      .toThrow(/safeDecimals must be in \[0, 18\], got 19/);
    expect(() => new AgniLiquiditySource({} as any, QUOTER, USDT0, USDC, 500, 19, 6, 300, []))
      .toThrow(/assetDecimals must be in \[0, 18\], got 19/);
  });
});
