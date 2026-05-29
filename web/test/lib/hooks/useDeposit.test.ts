import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useReadContract: vi.fn(),
  useWriteContract: vi.fn(),
  useAccount: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useReadContract: mocks.useReadContract,
  useWriteContract: mocks.useWriteContract,
  useAccount: mocks.useAccount,
}));

import { useDeposit } from "../../../src/lib/hooks/useDeposit";

describe("useDeposit", () => {
  it("starts in idle state when wallet is disconnected", () => {
    mocks.useAccount.mockReturnValueOnce({ address: undefined, isConnected: false });
    mocks.useReadContract.mockReturnValueOnce({ data: BigInt(0), refetch: vi.fn() });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useDeposit());
    expect(result.current.state).toBe("idle");
    expect(result.current.canDeposit).toBe(false);
  });

  it("canDeposit is true once wallet connected and allowance sufficient for amount", () => {
    mocks.useAccount.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    mocks.useReadContract.mockReturnValueOnce({ data: BigInt("1000000000000"), refetch: vi.fn() });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useDeposit());
    expect(result.current.canDeposit).toBe(true);
  });
});
