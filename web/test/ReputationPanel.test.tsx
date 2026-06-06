import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {} })}</>,
  },
}));

const { useReputationMock, useGiveFeedbackMock } = vi.hoisted(() => ({
  useReputationMock: vi.fn(),
  useGiveFeedbackMock: vi.fn(),
}));

vi.mock("../src/lib/hooks/useReputation", () => ({
  useReputation: useReputationMock,
}));

vi.mock("../src/lib/hooks/useGiveFeedback", () => ({
  useGiveFeedback: useGiveFeedbackMock,
}));

import ReputationPanel from "../src/components/ReputationPanel";

const SAMPLE_ENTRIES = [
  {
    blockNumber: BigInt(100),
    txHash: "0xaaa",
    client: "0x1111111111111111111111111111111111111111",
    stars: 5,
    tag1: "depeg-protection",
    uri: "data:application/json," + encodeURIComponent(JSON.stringify({ stars: 5, comment: "saved my funds" })),
  },
  {
    blockNumber: BigInt(99),
    txHash: "0xbbb",
    client: "0x2222222222222222222222222222222222222222",
    stars: 4,
    tag1: "depeg-protection",
    uri: "data:application/json," + encodeURIComponent(JSON.stringify({ stars: 4, comment: "" })),
  },
];

describe("ReputationPanel", () => {
  it("renders the reputation panel, aggregate, recent ratings, and rate form when canRate", () => {
    useReputationMock.mockReturnValue({
      entries: SAMPLE_ENTRIES,
      count: 2,
      averageStars: 4.5,
      isLoading: false,
    });
    useGiveFeedbackMock.mockReturnValue({
      state: "idle",
      canRate: true,
      isOwner: false,
      txHash: undefined,
      error: undefined,
      rate: vi.fn(),
    });

    const { container, getByRole } = render(<ReputationPanel />);
    const text = container.textContent ?? "";

    expect(text).toContain("// reputation");
    // aggregate average + ratings count
    expect(text).toContain("4.5");
    expect(text.toLowerCase()).toContain("ratings");
    // recent ratings — addresses + a decoded comment
    expect(text).toContain("0x1111");
    expect(text).toContain("saved my funds");
    // rate form present (RATE button) when canRate
    expect(getByRole("button", { name: /^rate$/i })).toBeTruthy();
  });

  it("shows the self-rate note when the connected wallet is the agent owner", () => {
    useReputationMock.mockReturnValue({
      entries: [],
      count: 0,
      averageStars: 0,
      isLoading: false,
    });
    useGiveFeedbackMock.mockReturnValue({
      state: "idle",
      canRate: false,
      isOwner: true,
      txHash: undefined,
      error: undefined,
      rate: vi.fn(),
    });

    const { container } = render(<ReputationPanel />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("agents can't rate themselves");
    // empty ratings state
    expect(text).toContain("no ratings yet");
  });
});
