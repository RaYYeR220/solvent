import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ForkReplay from "../src/components/ForkReplay";

const FIXTURE_TRANSIENT = {
  scenario: "transient-depeg",
  ticks: [
    { tick: 0, regime: "CALM", action: "PARK_YIELD", reasonCode: "park-calm",
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000",
        liquidityDepth: "0", assetBalance: "1000000000" },
      postActionBalance: "1000000000",
      txHash: "0xe04" + "0".repeat(60), uri: "data:..." },
    { tick: 1, regime: "EARLY_DEPEG", action: "SWAP_TO_SAFE", reasonCode: "early-exit",
      signals: { navPrice: "1000000000000000000", marketPrice: "960000000000000000",
        liquidityDepth: "1000000000000", assetBalance: "1000000000" },
      postActionBalance: "0",
      txHash: "0xe01" + "0".repeat(60), uri: "data:..." },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => FIXTURE_TRANSIENT,
  } as any);
});

describe("ForkReplay", () => {
  it("renders the scenario picker", async () => {
    const { getByLabelText } = render(<ForkReplay />);
    expect(getByLabelText(/transient/i)).toBeTruthy();
    expect(getByLabelText(/terminal/i)).toBeTruthy();
  });

  it("loads the selected scenario and displays the first tick", async () => {
    const { findByText } = render(<ForkReplay />);
    await findByText(/CALM/);
    await findByText(/park-calm/);
  });
});
