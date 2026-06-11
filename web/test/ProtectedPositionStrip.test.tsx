import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useVaultStateMock } = vi.hoisted(() => ({ useVaultStateMock: vi.fn() }));
const SIX_DEC_STATE = {
  totalAssets: BigInt(1_234_560_000),    // 1234.56 USDT0 (6 dec)
  userShares: BigInt(100_000_000),       // 100 svUSDT0
  safeAssetBalance: BigInt(0),
  riskAssetBalance: BigInt(1_234_560_000),
  assetDecimals: 6,
  shareDecimals: 6,
  safeDecimals: 6,
  decimalsLoading: false,
  address: "0xCAFE…BEEF",
  killSwitch: false,
};
vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: useVaultStateMock,
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
  beforeEach(() => {
    useVaultStateMock.mockReturnValue(SIX_DEC_STATE);
  });
  afterEach(() => {
    useVaultStateMock.mockReset();
  });

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

  it("renders an 18-decimal asset (USDY) as $100.00, not trillions", () => {
    // The fork demo vault: 100 USDY (18 dec). Old hardcoded /1e6 showed ~$100T.
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("100000000000000000000"), // 100e18
      userShares: BigInt("100000000000000000000"),  // 100e18
      riskAssetBalance: BigInt("100000000000000000000"),
      assetDecimals: 18,
      shareDecimals: 18,
      safeDecimals: 6,
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("$100.00");
    expect(container.textContent).not.toMatch(/trillion|,000,000,000/);
  });

  it("prod-equivalence: 6-dec and 18-dec inputs of the same value render identically", () => {
    // USDT0 path: 1234.56 at 6 dec.
    useVaultStateMock.mockReturnValue(SIX_DEC_STATE);
    const six = render(<ProtectedPositionStrip />);
    expect(six.container.textContent).toContain("$1,234.56");
    six.unmount();

    // Same 1234.56 value expressed at 18 dec must render the SAME $1,234.56.
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("1234560000000000000000"),
      userShares: BigInt("100000000000000000000"),
      riskAssetBalance: BigInt("1234560000000000000000"),
      assetDecimals: 18, shareDecimals: 18, safeDecimals: 6,
    });
    const eighteen = render(<ProtectedPositionStrip />);
    expect(eighteen.container.textContent).toContain("$1,234.56");
    eighteen.unmount();
  });

  it("shows … instead of a wrong-magnitude number while decimals load", () => {
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("100000000000000000000"),
      userShares: BigInt(0),
      riskAssetBalance: BigInt(0),
      assetDecimals: 18, shareDecimals: 18, safeDecimals: 18,
      decimalsLoading: true,
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("…");
    // No $ amount flashed while loading.
    expect(container.textContent).not.toMatch(/\$\d/);
  });
});
