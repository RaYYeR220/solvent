import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useReadContract: vi.fn().mockReturnValue({
    data: BigInt("1010000000000000000"),
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../../src/lib/contracts", () => ({
  CONTRACTS: {
    oracle: "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f",
    asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    agentId: BigInt(106),
  },
  rwaOracleAbi: [],
}));

import { useOraclePrice } from "../../../src/lib/hooks/useOraclePrice";

describe("useOraclePrice", () => {
  it("falls back to constant 1e18 when asset is not USDY", () => {
    const { result } = renderHook(() => useOraclePrice());
    expect(result.current.priceWei).toBe(BigInt("1000000000000000000"));
    expect(result.current.source).toBe("constant");
  });
});
