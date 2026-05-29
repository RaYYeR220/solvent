import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", async () => {
  return {
    useReadContracts: vi.fn().mockReturnValue({
      data: [
        { status: "success", result: BigInt(1_500_000_000) },
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
  it("returns a vault state shape compatible with VaultState", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current).toBeDefined();
    expect(result.current.address).toMatch(/^0x[a-fA-F0-9]{4}/);
  });
});
