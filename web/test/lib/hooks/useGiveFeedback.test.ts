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

import { useGiveFeedback, AGENT_OWNER } from "../../../src/lib/hooks/useGiveFeedback";

describe("useGiveFeedback", () => {
  it("disconnected → idle, canRate false, isOwner false", () => {
    mocks.useAccount.mockReturnValueOnce({ address: undefined, isConnected: false });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useGiveFeedback());
    expect(result.current.state).toBe("idle");
    expect(result.current.canRate).toBe(false);
    expect(result.current.isOwner).toBe(false);
  });

  it("connected non-owner → canRate true, isOwner false", () => {
    mocks.useAccount.mockReturnValueOnce({ address: "0x1111111111111111111111111111111111111111", isConnected: true });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useGiveFeedback());
    expect(result.current.canRate).toBe(true);
    expect(result.current.isOwner).toBe(false);
  });

  it("connected as AGENT_OWNER → isOwner true, canRate false (case-insensitive)", () => {
    mocks.useAccount.mockReturnValueOnce({ address: AGENT_OWNER.toLowerCase(), isConnected: true });
    mocks.useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useGiveFeedback());
    expect(result.current.isOwner).toBe(true);
    expect(result.current.canRate).toBe(false);
  });
});
