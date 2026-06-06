import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    totalAssets: BigInt(1_234_560_000),    // 1234.56 USDT0 (6 dec)
    userShares: BigInt(100_000_000),       // 100 svUSDT0
    safeAssetBalance: BigInt(0),
    riskAssetBalance: BigInt(1_234_560_000),
    address: "0xCAFE…BEEF",
    killSwitch: false,
  }),
}));

vi.mock("../src/lib/hooks/useOraclePrice", () => ({
  useOraclePrice: () => ({ priceWei: BigInt("1000000000000000000"), source: "constant", isLoading: false, isError: false }),
}));

vi.mock("../src/lib/hooks/useDexPrice", () => ({
  useDexPrice: () => ({ priceWei: BigInt("1000000000000000000"), fellBack: true, isLoading: false, isError: false }),
}));

vi.mock("../src/lib/hooks/useDecisionLog", () => ({
  useDecisionLog: () => ({ entries: [], attestationsTotal: 42, isLoading: false }),
}));

import ProtectedPositionStrip from "../src/components/ProtectedPositionStrip";

describe("ProtectedPositionStrip", () => {
  it("renders TVL big number + user position + status row", () => {
    const { getByText, container } = render(<ProtectedPositionStrip />);
    // $1,234.56 TVL
    expect(getByText(/\$1,234\.56/)).toBeTruthy();
    // user shares line includes "100" share count
    expect(container.textContent).toContain("100.00");
    // status row mentions REGIME / NAV / MKT
    expect(container.textContent).toMatch(/REGIME/);
    expect(container.textContent).toMatch(/NAV/);
    expect(container.textContent).toMatch(/MKT/);
    expect(container.textContent).toMatch(/ATTEST/);
  });
});
