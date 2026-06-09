import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock wagmi reads. useReadContract returns the vault.policy() tuple;
// useReadContracts returns the bridge-venue [collateralUnderlying, debtUnderlying].
const useReadContract = vi.fn();
const useReadContracts = vi.fn();

vi.mock("wagmi", () => ({
  useReadContract: (args: unknown) => useReadContract(args),
  useReadContracts: (args: unknown) => useReadContracts(args),
}));

import { useVaultMode } from "../src/lib/hooks/useVaultMode";

const ZERO = "0x0000000000000000000000000000000000000000";
const VENUE = "0x398E4948e373Db819606A459456176D31C3B1F91";

// Policy tuple: [early, terminal, liqFloor, slippage, safeAsset, bridgeVenue, maxLtv, allowed]
function policyTuple(bridgeVenue: string) {
  return [
    50,
    500,
    BigInt(0),
    300,
    "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    bridgeVenue,
    5000,
    14,
  ];
}

describe("useVaultMode", () => {
  beforeEach(() => {
    useReadContract.mockReset();
    useReadContracts.mockReset();
  });

  it("returns DIRECT when bridgeVenue is the zero address", () => {
    useReadContract.mockReturnValue({ data: policyTuple(ZERO), isLoading: false, isError: false });
    // venue reads are disabled (no venue) — return empty.
    useReadContracts.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const { result } = renderHook(() => useVaultMode());
    expect(result.current.mode).toBe("DIRECT");
    expect(result.current.collateral).toBe(BigInt(0));
    expect(result.current.debt).toBe(BigInt(0));
  });

  it("returns DIRECT when a venue is wired but holds zero collateral", () => {
    useReadContract.mockReturnValue({ data: policyTuple(VENUE), isLoading: false, isError: false });
    useReadContracts.mockReturnValue({
      data: [
        { status: "success", result: BigInt(0) },
        { status: "success", result: BigInt(0) },
      ],
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useVaultMode());
    expect(result.current.mode).toBe("DIRECT");
    expect(result.current.collateral).toBe(BigInt(0));
    expect(result.current.debt).toBe(BigInt(0));
  });

  it("returns BRIDGED with collateral+debt when the venue holds collateral", () => {
    const coll = BigInt("4999990000000000000000"); // ~4999.99 USDY (18 dec)
    const debt = BigInt("2500000001"); // ~2500.000001 USDC (6 dec)
    useReadContract.mockReturnValue({ data: policyTuple(VENUE), isLoading: false, isError: false });
    useReadContracts.mockReturnValue({
      data: [
        { status: "success", result: coll },
        { status: "success", result: debt },
      ],
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useVaultMode());
    expect(result.current.mode).toBe("BRIDGED");
    expect(result.current.collateral).toBe(coll);
    expect(result.current.debt).toBe(debt);
  });
});
