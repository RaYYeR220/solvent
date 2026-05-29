import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useWatchContractEvent: vi.fn(),
  useBlockNumber: vi.fn().mockReturnValue({ data: BigInt(96000000) }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

import { useDecisionLog } from "../../../src/lib/hooks/useDecisionLog";

describe("useDecisionLog", () => {
  it("returns the empty-log state initially", () => {
    const { result } = renderHook(() => useDecisionLog());
    expect(result.current.entries).toEqual([]);
    expect(result.current.attestationsTotal).toBe(0);
  });
});
