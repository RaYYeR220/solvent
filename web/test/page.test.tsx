import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void; address?: string; truncatedAddress?: string }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {}, address: undefined, truncatedAddress: undefined })}</>,
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useReadContract: () => ({ data: BigInt(0), refetch: vi.fn() }),
  useReadContracts: () => ({ data: undefined, isLoading: false, isError: false }),
  useSimulateContract: () => ({ data: undefined, isLoading: false, isError: false }),
  useWatchContractEvent: () => undefined,
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

import DashboardPage from "../src/app/app/page";

describe("DashboardPage (V2)", () => {
  it("renders without the onboarding gate", () => {
    const { container, queryByText } = render(<DashboardPage />);
    expect(queryByText(/connect a wallet to begin/i)).toBeNull();
    expect(container.textContent).toContain("SOLVENT");
    expect(container.textContent?.toLowerCase()).toContain("vault_actions");
    expect(container.textContent?.toLowerCase()).toContain("policy_reg");
    expect(container.textContent?.toLowerCase()).toContain("price_nav_feed");
    expect(container.textContent?.toLowerCase()).toContain("decision_log");
  });
});
