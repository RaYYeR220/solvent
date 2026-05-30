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
});
