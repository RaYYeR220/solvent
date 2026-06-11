import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => {
  return {
    useAccount: vi.fn().mockReturnValue({ address: undefined }),
    useReadContracts: vi.fn().mockReturnValue({
      data: [
        { status: "success", result: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" },
        { status: "success", result: "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c" },
        { status: "success", result: BigInt(106) },
        { status: "success", result: "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798" },
        { status: "success", result: false },
        { status: "success", result: BigInt(1_500_000_000) }, // totalAssets
        { status: "success", result: 6 },  // asset decimals (USDT0)
        { status: "success", result: 6 },  // share decimals
        { status: "success", result: 6 },  // safe-asset decimals (USDC)
        { status: "success", result: "USDT0" },   // asset symbol
        { status: "success", result: "svUSDT0" }, // share symbol
        { status: "success", result: "USDC" },    // safe-asset symbol
      ],
      isLoading: false,
      isError: false,
    }),
    useReadContract: vi.fn().mockReturnValue({
      data: BigInt(5_000_000_000),
      isLoading: false,
      isError: false,
    }),
  };
});

import * as wagmi from "wagmi";
import { useVaultState } from "../../../src/lib/hooks/useVaultState";

describe("useVaultState", () => {
  it("returns a vault state shape with totalAssets and userShares", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current.totalAssets).toBe(BigInt(1_500_000_000));
    expect(result.current.killSwitch).toBe(false);
    expect(result.current.address).toMatch(/^0x[a-fA-F0-9]{4}/);
    // userShares defaults to 0n when wallet disconnected.
    expect(result.current.userShares).toBe(BigInt(0));
  });

  it("reads asset/share/safe decimals from chain (USDT0 = 6)", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current.assetDecimals).toBe(6);
    expect(result.current.shareDecimals).toBe(6);
    expect(result.current.safeDecimals).toBe(6);
    expect(result.current.decimalsLoading).toBe(false);
  });

  it("reads asset/share/safe symbols from chain (USDT0 / svUSDT0 / USDC)", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current.assetSymbol).toBe("USDT0");
    expect(result.current.shareSymbol).toBe("svUSDT0");
    expect(result.current.safeSymbol).toBe("USDC");
    expect(result.current.symbolsLoading).toBe(false);
  });

  it("threads 18-decimal reads through (e.g. USDY asset)", () => {
    vi.mocked(wagmi.useReadContracts).mockReturnValueOnce({
      data: [
        { status: "success", result: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" },
        { status: "success", result: "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c" },
        { status: "success", result: BigInt(106) },
        { status: "success", result: "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798" },
        { status: "success", result: false },
        { status: "success", result: BigInt("100000000000000000000") }, // 100 USDY (18 dec)
        { status: "success", result: 18 }, // asset decimals (USDY)
        { status: "success", result: 18 }, // share decimals
        { status: "success", result: 6 },  // safe-asset decimals (USDC)
        { status: "success", result: "USDY" },    // asset symbol (fork)
        { status: "success", result: "svUSDT0" }, // share symbol (V2.1 reused V2's symbol on the fork)
        { status: "success", result: "USDC" },    // safe-asset symbol
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof wagmi.useReadContracts>);
    const { result } = renderHook(() => useVaultState());
    expect(result.current.assetDecimals).toBe(18);
    expect(result.current.shareDecimals).toBe(18);
    expect(result.current.safeDecimals).toBe(6);
    // 100e18 / 10**18 = 100 (not 100 trillion as the old hardcoded /1e6 produced).
    expect(Number(result.current.totalAssets) / 10 ** result.current.assetDecimals).toBe(100);
    // Symbols flow through from chain — asset reads "USDY" on the fork, not the
    // hardcoded "USDT0"; the share symbol is the honest on-chain "svUSDT0".
    expect(result.current.assetSymbol).toBe("USDY");
    expect(result.current.shareSymbol).toBe("svUSDT0");
    expect(result.current.safeSymbol).toBe("USDC");
  });

  it("defaults decimals to 18 (not 6) and flags decimalsLoading while reads are in-flight", () => {
    vi.mocked(wagmi.useReadContracts).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof wagmi.useReadContracts>);
    const { result } = renderHook(() => useVaultState());
    expect(result.current.assetDecimals).toBe(18);
    expect(result.current.shareDecimals).toBe(18);
    expect(result.current.decimalsLoading).toBe(true);
    // Symbols are empty (not a wrong hardcoded "USDT0") while reads are in-flight.
    expect(result.current.assetSymbol).toBe("");
    expect(result.current.shareSymbol).toBe("");
    expect(result.current.symbolsLoading).toBe(true);
  });
});
