import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useSim } = vi.hoisted(() => ({ useSim: vi.fn() }));
vi.mock("wagmi", () => ({ useSimulateContract: useSim }));

import { useDexPrice } from "../../../src/lib/hooks/useDexPrice";

describe("useDexPrice", () => {
  it("returns price normalised to 1e18 on quoter success", () => {
    useSim.mockReturnValueOnce({
      data: { result: [BigInt(999_000), BigInt(0), 0, BigInt(0)] },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useDexPrice());
    expect(result.current.priceWei).toBe(BigInt("999000000000000000"));
    expect(result.current.fellBack).toBe(false);
  });

  it("falls back to 1e18 when the quoter reverts (zero liquidity)", () => {
    useSim.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("execution reverted"),
    });
    const { result } = renderHook(() => useDexPrice());
    expect(result.current.priceWei).toBe(BigInt("1000000000000000000"));
    expect(result.current.fellBack).toBe(true);
  });
});
