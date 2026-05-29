import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children?: any }) =>
      typeof children === "function"
        ? children({ isConnected: false, show: () => {}, address: undefined, ensName: undefined })
        : null,
  },
}));

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn(),
  useWriteContract: vi.fn(),
}));

vi.mock("wagmi", () => mocks);

import OnboardingFlow from "../src/components/OnboardingFlow";

describe("OnboardingFlow", () => {
  it("renders the connect button in disconnected state", () => {
    mocks.useAccount.mockReturnValue({ address: undefined, isConnected: false });
    mocks.useReadContract.mockReturnValue({ data: BigInt(0), refetch: vi.fn() });
    mocks.useWriteContract.mockReturnValue({ writeContractAsync: vi.fn(), isPending: false });
    const { getByText } = render(<OnboardingFlow onDeposit={() => {}} />);
    expect(getByText(/connect wallet/i)).toBeTruthy();
  });
});
