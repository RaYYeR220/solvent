import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void; address?: string; truncatedAddress?: string }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {}, address: undefined, truncatedAddress: undefined })}</>,
  },
}));

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    killSwitch: false,
    agent: "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c",
    address: "0xCAFE…BEEF",
    totalAssets: BigInt(1000),
  }),
}));

vi.mock("../src/lib/hooks/useDecisionLog", () => ({
  useDecisionLog: () => ({
    entries: [],
    attestationsTotal: 0,
    isLoading: false,
  }),
}));

import DashboardHeader from "../src/components/DashboardHeader";

describe("DashboardHeader", () => {
  it("renders brand + three status rows", () => {
    const { getByText, container } = render(<DashboardHeader />);
    expect(getByText("SOLVENT")).toBeTruthy();
    expect(getByText(/DEPEG\.GUARDIAN/)).toBeTruthy();
    expect(getByText(/KILLSWITCH/i)).toBeTruthy();
    expect(getByText(/AGENT/i)).toBeTruthy();
    expect(container.textContent?.toLowerCase()).toContain("connect");
  });
});
