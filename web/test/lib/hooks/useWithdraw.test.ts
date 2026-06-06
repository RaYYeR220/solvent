import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useWriteContract: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useWriteContract: mocks.useWriteContract,
}));

import { useWithdraw } from "../../../src/lib/hooks/useWithdraw";

describe("useWithdraw", () => {
  it("starts in idle state when wallet is disconnected", () => {
    mocks.useAccount.mockReturnValueOnce({ address: undefined, isConnected: false });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useWithdraw());
    expect(result.current.state).toBe("idle");
    expect(result.current.canWithdraw).toBe(false);
  });

  it("canWithdraw is true once wallet connected", () => {
    mocks.useAccount.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useWithdraw());
    expect(result.current.canWithdraw).toBe(true);
  });
});
