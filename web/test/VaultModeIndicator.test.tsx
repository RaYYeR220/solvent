import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const useVaultMode = vi.fn();

vi.mock("../src/lib/hooks/useVaultMode", () => ({
  useVaultMode: () => useVaultMode(),
}));

// VaultModeIndicator also reads symbols + decimals from chain via useVaultState
// (collateral = risk asset, debt = safe asset). Mock it so the fork values
// (USDY collateral 18-dec, USDC debt 6-dec) flow through.
vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    assetDecimals: 18,
    safeDecimals: 6,
    assetSymbol: "USDY",
    safeSymbol: "USDC",
  }),
}));

import VaultModeIndicator from "../src/components/VaultModeIndicator";

describe("VaultModeIndicator", () => {
  beforeEach(() => {
    useVaultMode.mockReset();
  });

  it("renders DIRECT mode", () => {
    useVaultMode.mockReturnValue({
      mode: "DIRECT",
      collateral: BigInt(0),
      debt: BigInt(0),
      isLoading: false,
      isError: false,
    });

    const { container } = render(<VaultModeIndicator />);
    expect(container.textContent).toContain("VAULT MODE: DIRECT");
    // No bridged breakdown line when direct.
    expect(container.textContent).not.toContain("collateral");
  });

  it("renders BRIDGED mode with collateral + borrowed breakdown", () => {
    useVaultMode.mockReturnValue({
      mode: "BRIDGED",
      collateral: BigInt("4999990000000000000000"), // ~4999.99 USDY (18 dec)
      debt: BigInt("2500000001"), // ~2500.00 USDC (6 dec)
      isLoading: false,
      isError: false,
    });

    const { container } = render(<VaultModeIndicator />);
    expect(container.textContent).toContain("VAULT MODE: BRIDGED");
    expect(container.textContent).toContain("collateral");
    expect(container.textContent).toContain("4,999.99");
    expect(container.textContent).toContain("USDY");
    expect(container.textContent).toContain("borrowed");
    expect(container.textContent).toContain("2,500.00");
    expect(container.textContent).toContain("USDC");
  });
});
