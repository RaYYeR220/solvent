import { render } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

const { mockUseDecisionLog } = vi.hoisted(() => ({ mockUseDecisionLog: vi.fn() }));

vi.mock("../src/lib/hooks/useDecisionLog", () => ({
  useDecisionLog: () => mockUseDecisionLog(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import LiveProof, { LiveBadge } from "../src/components/LiveProof";

const TX_SWAP = "0xabc123" + "0".repeat(58);
const TX_OBS = "0xdef456" + "0".repeat(58);

const ENTRIES = [
  {
    blockNumber: BigInt(200),
    txHash: TX_SWAP,
    uri: "",
    payload: {
      tick: 7,
      timestamp: 1717003600,
      regime: "EARLY_DEPEG",
      decision: { action: "SWAP_TO_SAFE", reasonCode: "early-exit" },
      signals: { navPrice: "1000000000000000000", marketPrice: "960000000000000000" },
    },
    payloadLoading: false,
  },
  {
    blockNumber: BigInt(100),
    txHash: TX_OBS,
    uri: "",
    payload: {
      tick: 6,
      timestamp: 1717000000,
      regime: "CALM",
      decision: { action: "NONE", reasonCode: "calm-idle" },
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000" },
    },
    payloadLoading: false,
  },
];

describe("LiveProof", () => {
  beforeEach(() => {
    mockUseDecisionLog.mockReset();
  });

  it("renders the live status row with the attestation count", () => {
    mockUseDecisionLog.mockReturnValue({ entries: ENTRIES, attestationsTotal: 18, isLoading: false });
    const { container } = render(<LiveProof />);
    const text = container.textContent ?? "";
    expect(text).toContain("LIVE");
    expect(text).toContain("18");
    expect(text.toLowerCase()).toContain("attestations on-chain");
  });

  it("renders recent decisions with Mantlescan tx links and action labels", () => {
    mockUseDecisionLog.mockReturnValue({ entries: ENTRIES, attestationsTotal: 18, isLoading: false });
    const { container } = render(<LiveProof />);
    const text = container.textContent ?? "";
    // raw on-chain regime + humanised action label
    expect(text).toContain("EARLY_DEPEG");
    expect(text).toContain("swap → safe");
    expect(text).toContain("CALM");
    expect(text).toContain("observe"); // NONE → observe
    // tx link points at the swap tx on the explorer
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(links.some((h) => h.includes(`/tx/${TX_SWAP}`))).toBe(true);
    expect(links.some((h) => h.includes("/address/"))).toBe(true); // verify-on-mantlescan
  });

  it("shows a loading state while reading the chain", () => {
    mockUseDecisionLog.mockReturnValue({ entries: [], attestationsTotal: 0, isLoading: true });
    const { container } = render(<LiveProof />);
    expect((container.textContent ?? "").toLowerCase()).toContain("reading on-chain attestations");
  });
});

describe("LiveBadge", () => {
  beforeEach(() => {
    mockUseDecisionLog.mockReset();
  });

  it("shows the attestation count once data is loaded", () => {
    mockUseDecisionLog.mockReturnValue({ entries: ENTRIES, attestationsTotal: 18, isLoading: false });
    const { container } = render(<LiveBadge />);
    const text = container.textContent ?? "";
    expect(text).toContain("Agent live on Mantle");
    expect(text).toContain("18");
    expect(text.toLowerCase()).toContain("attestations");
  });
});
