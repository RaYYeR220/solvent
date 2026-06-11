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

const { useVaultStateMock } = vi.hoisted(() => ({ useVaultStateMock: vi.fn() }));
const DEFAULT_VAULT_STATE = {
  userShares: BigInt(100_000_000),
  riskAssetBalance: BigInt(1_000_000_000),
  safeAssetBalance: BigInt(0),
  totalAssets: BigInt(1_000_000_000),
  assetDecimals: 6,
  shareDecimals: 6,
  safeDecimals: 6,
  assetSymbol: "USDT0",
  shareSymbol: "svUSDT0",
  safeSymbol: "USDC",
  decimalsLoading: false,
  symbolsLoading: false,
};
useVaultStateMock.mockReturnValue(DEFAULT_VAULT_STATE);
vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => useVaultStateMock(),
}));

vi.mock("../src/lib/hooks/useDeposit", () => ({
  useDeposit: () => ({
    state: "idle",
    canDeposit: true,
    approveTxHash: undefined,
    depositTxHash: undefined,
    error: undefined,
    approve: vi.fn(),
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
    // No deposit/withdraw sections when disconnected.
    expect(container.textContent?.toLowerCase()).not.toContain("// deposit");
  });

  it("shows BOTH deposit and withdraw sections side-by-side when connected (no tabs)", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    const { container, queryByRole } = render(<VaultActions />);
    const text = container.textContent ?? "";
    expect(text.toLowerCase()).toContain("// deposit");
    expect(text.toLowerCase()).toContain("// withdraw");
    expect(text).toContain("YOU PAY");
    expect(text).toContain("YOU BURN");
    // Symbols come from chain — USDT0 asset + svUSDT0 shares on the mainnet vault.
    expect(text).toContain("USDT0");
    expect(text).toContain("svUSDT0");
    // No tab buttons — there should be no plain-text "DEPOSIT" / "WITHDRAW"
    // toggle-style buttons. The buttons that DO exist are MAX or state-driven
    // primary buttons (ENTER AMOUNT / APPROVE X / etc.).
    expect(queryByRole("button", { name: /^deposit$/i })).toBeNull();
    expect(queryByRole("button", { name: /^withdraw$/i })).toBeNull();
  });

  it("uses chain symbols for a fork vault (USDY asset) instead of hardcoded USDT0", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    useVaultStateMock.mockReturnValue({
      ...DEFAULT_VAULT_STATE,
      assetDecimals: 18,
      shareDecimals: 18,
      assetSymbol: "USDY",
      shareSymbol: "svUSDT0", // honest on-chain value: V2.1 reused V2's share symbol
    });
    const { container } = render(<VaultActions />);
    const text = container.textContent ?? "";
    // Asset symbol comes from chain — the fork vault shows USDY, proving the
    // label is no longer the hardcoded "USDT0". (The share symbol is still the
    // honest on-chain "svUSDT0", which is intentional.)
    expect(text).toContain("USDY");
    useVaultStateMock.mockReturnValue(DEFAULT_VAULT_STATE);
  });

  it("MAX button on deposit side sets amount to the wallet USDT0 balance", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    // First read = walletBalance, second = allowance, third = totalSupply.
    // Stub all reads to walletBal=47_500_000 (47.50 USDT0).
    useReadContractMock.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return { data: BigInt(47_500_000), refetch: vi.fn() };
      return { data: BigInt(0), refetch: vi.fn() };
    });
    const { container, getByLabelText } = render(<VaultActions />);
    const input = getByLabelText(/deposit amount/i) as HTMLInputElement;
    expect(input.value).toBe("");
    // Click the deposit-column MAX button (the first MAX in the DOM).
    const maxButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "MAX",
    );
    expect(maxButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(maxButtons[0]);
    expect(input.value).toBe("47.5");
  });

  it("primary button label flips to APPROVE … once an amount is entered (insufficient allowance)", () => {
    useAccountMock.mockReturnValue({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    const { container, getByLabelText } = render(<VaultActions />);
    const input = getByLabelText(/deposit amount/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });
    expect(container.textContent?.toUpperCase()).toContain("APPROVE 10");
  });
});
