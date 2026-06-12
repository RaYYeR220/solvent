import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useSim, useRead } = vi.hoisted(() => ({ useSim: vi.fn(), useRead: vi.fn() }));
// The hook now reads the asset's decimals on-chain (FIX 1) to size the probe
// amount to ONE WHOLE token (10 ** decimals), so the mock must cover both
// useSimulateContract and useReadContract.
vi.mock("wagmi", () => ({ useSimulateContract: useSim, useReadContract: useRead }));

import { useDexPrice } from "../../../src/lib/hooks/useDexPrice";

describe("useDexPrice", () => {
  it("returns price normalised to 1e18 on quoter success", () => {
    useRead.mockReturnValue({ data: 6, isLoading: false, isError: false });
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
    useRead.mockReturnValue({ data: 6, isLoading: false, isError: false });
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

  it("probes ONE WHOLE 18-dec token (USDY) — amountIn = 1e18, not 1e6", () => {
    useRead.mockReturnValue({ data: 18, isLoading: false, isError: false });
    useSim.mockReturnValue({
      data: { result: [BigInt("1050000"), BigInt(0), 0, BigInt(0)] },
      isLoading: false,
      isError: false,
    });
    renderHook(() => useDexPrice());
    // The probe amountIn passed to the quoter must be 10 ** 18 for an 18-dec
    // asset. A hardcoded 1e6 would quote 1e-12 token → ~0 out → MKT 0.000.
    const simArgs = useSim.mock.calls[useSim.mock.calls.length - 1][0];
    expect(simArgs.args[0].amountIn).toBe(BigInt("1000000000000000000"));
  });

  it("defaults the probe to 1e6 (6-dec / USDT0) while the decimals read is pending", () => {
    useRead.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useSim.mockReturnValue({
      data: { result: [BigInt("1000000"), BigInt(0), 0, BigInt(0)] },
      isLoading: false,
      isError: false,
    });
    renderHook(() => useDexPrice());
    const simArgs = useSim.mock.calls[useSim.mock.calls.length - 1][0];
    expect(simArgs.args[0].amountIn).toBe(BigInt("1000000"));
  });
});
