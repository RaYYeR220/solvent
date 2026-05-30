import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {} })}</>,
  },
}));

const { useAccountMock, useReadContractMock } = vi.hoisted(() => ({
  useAccountMock: vi.fn(),
  useReadContractMock: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
  useReadContract: useReadContractMock,
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    userShares: BigInt(100_000_000),
    riskAssetBalance: BigInt(1_000_000_000),
    safeAssetBalance: BigInt(0),
    totalAssets: BigInt(1_000_000_000),
  }),
}));

vi.mock("../src/lib/hooks/useDeposit", () => ({
  useDeposit: () => ({
    state: "idle",
    canDeposit: true,
    approveTxHash: undefined,
    depositTxHash: undefined,
    error: undefined,
    deposit: vi.fn(),
  }),
}));

vi.mock("../src/lib/hooks/useWithdraw", () => ({
  useWithdraw: () => ({
    state: "idle",
    canWithdraw: true,
    txHash: undefined,
    error: undefined,
    redeem: vi.fn(),
    redeemAll: vi.fn(),
  }),
}));

import VaultActions from "../src/components/VaultActions";

describe("VaultActions", () => {
  it("shows the wallet-connect fallback when disconnected", () => {
    useAccountMock.mockReturnValue({ address: undefined, isConnected: false });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    const { container } = render(<VaultActions />);
    expect(container.textContent?.toLowerCase()).toContain("connect");
  });

  it("renders deposit tab by default when wallet connected", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    const { getAllByText, getByPlaceholderText } = render(<VaultActions />);
    expect(getAllByText(/DEPOSIT/i).length).toBeGreaterThan(0);
    expect(getAllByText(/WITHDRAW/i).length).toBeGreaterThan(0);
    expect(getByPlaceholderText(/0\.00/)).toBeTruthy();
    expect(getAllByText(/APPROVE/i).length).toBeGreaterThan(0);
  });

  it("switches to withdraw tab on click", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    const { getByText, container } = render(<VaultActions />);
    fireEvent.click(getByText(/^WITHDRAW$/i));
    expect(container.textContent?.toUpperCase()).toContain("YOUR POSITION");
  });
});
