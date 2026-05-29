import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useReadContract: vi.fn().mockReturnValue({
    data: [50, 500, BigInt(0), 300, "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", "0x783bC82FE4AFB635De351EEB0D09542D3B09C847", 5000, 30],
    isLoading: false,
    isError: false,
  }),
}));

import { usePolicy } from "../../../src/lib/hooks/usePolicy";

describe("usePolicy", () => {
  it("decomposes vault.policy() tuple into a typed PolicyLive shape", () => {
    const { result } = renderHook(() => usePolicy());
    expect(result.current.earlyDivergenceBps).toBe(50);
    expect(result.current.terminalDivergenceBps).toBe(500);
    expect(result.current.maxSlippageBps).toBe(300);
    expect(result.current.maxBridgeLTVBps).toBe(5000);
  });
});
