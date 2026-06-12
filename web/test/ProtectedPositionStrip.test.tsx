import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useVaultStateMock } = vi.hoisted(() => ({ useVaultStateMock: vi.fn() }));
const { useAccountMock } = vi.hoisted(() => ({ useAccountMock: vi.fn() }));
const { useDecisionLogMock } = vi.hoisted(() => ({ useDecisionLogMock: vi.fn() }));
const SIX_DEC_STATE = {
  totalAssets: BigInt(1_234_560_000),    // 1234.56 USDT0 (6 dec)
  userShares: BigInt(100_000_000),       // 100 svUSDT0
  safeAssetBalance: BigInt(0),
  riskAssetBalance: BigInt(1_234_560_000),
  assetDecimals: 6,
  shareDecimals: 6,
  safeDecimals: 6,
  assetSymbol: "USDT0",
  shareSymbol: "svUSDT0",
  safeSymbol: "USDC",
  decimalsLoading: false,
  symbolsLoading: false,
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
  useDecisionLog: useDecisionLogMock,
}));

// FIX 3 — the strip subscribes to wallet connection state (useAccount), but the
// stake-vs-composition choice keys off vault.userShares: a viewer holding 0
// shares (no wallet OR connected non-depositor) sees the vault composition.
vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
}));

import ProtectedPositionStrip from "../src/components/ProtectedPositionStrip";

describe("ProtectedPositionStrip", () => {
  beforeEach(() => {
    useVaultStateMock.mockReturnValue(SIX_DEC_STATE);
    // Default: no wallet connected (the demo case).
    useAccountMock.mockReturnValue({ isConnected: false });
    // Default: no attestation yet → strip falls back to live oracle/dex reads.
    useDecisionLogMock.mockReturnValue({ entries: [], attestationsTotal: 42, isLoading: false });
  });
  afterEach(() => {
    useVaultStateMock.mockReset();
    useAccountMock.mockReset();
    useDecisionLogMock.mockReset();
  });

  it("renders TVL big number + status row", () => {
    const { getByText, container } = render(<ProtectedPositionStrip />);
    // $1,234.56 TVL
    expect(getByText(/\$1,234\.56/)).toBeTruthy();
    // asset symbol comes from chain — USDT0 on the mainnet vault.
    expect(container.textContent).toContain("USDT0");
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
      assetSymbol: "USDY",
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("$100.00");
    expect(container.textContent).not.toMatch(/trillion|,000,000,000/);
    // Symbol comes from chain — the fork vault renders USDY, not a hardcoded USDT0.
    expect(container.textContent).toContain("USDY");
    expect(container.textContent).not.toContain("USDT0");
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

  // FIX 3 — no-wallet case (userShares 0) shows vault composition (risk · safe),
  // not a 0.00 stake.
  it("with no wallet connected, shows vault composition '100.00 USDY · 0.00 USDC'", () => {
    useAccountMock.mockReturnValue({ isConnected: false });
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("100000000000000000000"),
      userShares: BigInt(0),                            // no stake
      riskAssetBalance: BigInt("100000000000000000000"), // 100 USDY (18 dec)
      safeAssetBalance: BigInt(0),                       // 0 USDC (6 dec)
      assetDecimals: 18, shareDecimals: 18, safeDecimals: 6,
      assetSymbol: "USDY",
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("100.00 USDY");
    expect(container.textContent).toContain("0.00 USDC");
    // No misleading "entry $" user-stake line when there's no wallet.
    expect(container.textContent).not.toMatch(/entry \$/);
  });

  // FIX 3 — connected wallet holding 0 shares (the real browser demo case) must
  // ALSO show the composition, not a misleading "0.00 USDT0 · entry" stake line.
  // The choice keys off userShares===0n, not isConnected.
  it("connected but 0 shares → shows vault composition, not a 0.00 stake", () => {
    useAccountMock.mockReturnValue({ isConnected: true, address: "0xUSER" });
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("100000000000000000000"),
      userShares: BigInt(0),                            // connected, but no deposit
      riskAssetBalance: BigInt("100000000000000000000"), // 100 USDY (18 dec)
      safeAssetBalance: BigInt(0),                       // 0 USDC (6 dec)
      assetDecimals: 18, shareDecimals: 18, safeDecimals: 6,
      assetSymbol: "USDY",
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("100.00 USDY");
    expect(container.textContent).toContain("0.00 USDC");
    // No user-stake line despite the wallet being connected.
    expect(container.textContent).not.toMatch(/entry \$/);
  });

  // FIX 3 — after the protective swap the composition flips: 0 USDY · 100 USDC.
  it("after the swap, composition reads '0.00 USDY · 100.00 USDC'", () => {
    useAccountMock.mockReturnValue({ isConnected: false });
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      totalAssets: BigInt("100000000"), // 100 USDC equiv (6 dec) — value preserved
      userShares: BigInt(0),
      riskAssetBalance: BigInt(0),       // 0 USDY
      safeAssetBalance: BigInt("100000000"), // 100 USDC (6 dec)
      assetDecimals: 18, shareDecimals: 18, safeDecimals: 6,
      assetSymbol: "USDY",
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("0.00 USDY");
    expect(container.textContent).toContain("100.00 USDC");
  });

  // FIX 3 — a depositor (userShares > 0) keeps the user-stake line (value · entry · Δ).
  it("with shares held, shows the user-stake line (entry · Δ)", () => {
    useAccountMock.mockReturnValue({ isConnected: true, address: "0xUSER" });
    useVaultStateMock.mockReturnValue({
      ...SIX_DEC_STATE,
      userShares: BigInt(100_000_000), // 100 svUSDT0 (6 dec)
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toContain("100.00");
    expect(container.textContent).toMatch(/entry \$/);
    expect(container.textContent).toMatch(/Δ/);
  });

  // FIX 2 — REGIME comes from the agent's latest attestation, NOT a strip-local
  // threshold. With a high live divergence the old hardcode would show TERMINAL;
  // the attestation says CALM, so the strip must show CALM.
  it("sources REGIME from the latest attestation — shows CALM despite high live divergence", () => {
    useAccountMock.mockReturnValue({ isConnected: false });
    useDecisionLogMock.mockReturnValue({
      attestationsTotal: 7,
      isLoading: false,
      entries: [
        {
          blockNumber: BigInt(100),
          txHash: "0xabc",
          uri: "ipfs://x",
          payloadLoading: false,
          payload: {
            regime: "CALM",
            signals: {
              // ~7% below NAV — a hardcoded 50/500-bps rule would scream TERMINAL.
              navPrice: "1136000000000000000",   // 1.136 (1e18-scaled)
              marketPrice: "1056000000000000000", // 1.056
            },
          },
        },
      ],
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toMatch(/REGIME:CALM/);
    expect(container.textContent).not.toMatch(/REGIME:TERMINAL/);
    // NAV/MKT mirror the attestation's signal prices.
    expect(container.textContent).toContain("1.136");
    expect(container.textContent).toContain("1.056");
    // DIV reflects the attested prices (~704 bps), still labelled CALM.
    expect(container.textContent).toMatch(/DIV:704bps/);
  });

  // FIX 2 — TERMINAL attestation maps to the short "TERMINAL" label.
  it("maps a TERMINAL_DEPEG attestation regime to the 'TERMINAL' display", () => {
    useDecisionLogMock.mockReturnValue({
      attestationsTotal: 3,
      isLoading: false,
      entries: [
        {
          blockNumber: BigInt(200),
          txHash: "0xdef",
          uri: "ipfs://y",
          payloadLoading: false,
          payload: {
            regime: "TERMINAL_DEPEG",
            signals: { navPrice: "1000000000000000000", marketPrice: "900000000000000000" },
          },
        },
      ],
    });
    const { container } = render(<ProtectedPositionStrip />);
    expect(container.textContent).toMatch(/REGIME:TERMINAL/);
  });
});
