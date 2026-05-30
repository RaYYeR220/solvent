import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChartPanel from "../src/components/ChartPanel";

const entries = [
  {
    blockNumber: BigInt(1),
    txHash: "0xaa" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 1,
      timestamp: 1717000000,
      regime: "CALM",
      decision: { action: "PARK_YIELD", reasonCode: "park-calm" },
      signals: { navPrice: "1000000000000000000", dexPrice: "1000000000000000000" },
    },
    payloadLoading: false,
  },
  {
    blockNumber: BigInt(2),
    txHash: "0xbb" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 2,
      timestamp: 1717003600,
      regime: "EARLY_DEPEG",
      decision: { action: "SWAP_TO_SAFE", reasonCode: "early-exit" },
      signals: { navPrice: "1000000000000000000", dexPrice: "960000000000000000" },
    },
    payloadLoading: false,
  },
];

describe("ChartPanel", () => {
  it("renders placeholder when no entries", () => {
    const { container } = render(<ChartPanel entries={[]} />);
    expect(container.textContent?.toLowerCase()).toContain("awaiting");
  });

  it("renders two SVG paths for NAV and MKT when entries present", () => {
    const { container } = render(<ChartPanel entries={entries} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("renders crosshair tooltip on mouse move over the chart area", () => {
    const { container } = render(<ChartPanel entries={entries} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    fireEvent.mouseMove(svg!, { clientX: 150, clientY: 40 });
    expect(container.textContent).toMatch(/tick #/i);
  });
});
