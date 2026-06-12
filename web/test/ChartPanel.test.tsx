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
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000" },
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
      signals: { navPrice: "1000000000000000000", marketPrice: "960000000000000000" },
    },
    payloadLoading: false,
  },
];

// Flat ~$1.00 stablecoin series (mainnet USDT0 shape) — both lines pinned at 1.000.
const flatEntries = [
  {
    blockNumber: BigInt(1),
    txHash: "0x11" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 1,
      timestamp: 1717000000,
      regime: "CALM",
      decision: { action: "PARK_YIELD", reasonCode: "park-calm" },
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000" },
    },
    payloadLoading: false,
  },
  {
    blockNumber: BigInt(2),
    txHash: "0x22" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 2,
      timestamp: 1717003600,
      regime: "CALM",
      decision: { action: "PARK_YIELD", reasonCode: "park-calm" },
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000" },
    },
    payloadLoading: false,
  },
];

// USDY / RWA range — nav ~1.1357, mkt ~1.053 (then a depeg dip to ~1.02).
// Wei strings (18 decimals).
const usdyEntries = [
  {
    blockNumber: BigInt(1),
    txHash: "0xcc" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 1,
      timestamp: 1717000000,
      regime: "CALM",
      decision: { action: "PARK_YIELD", reasonCode: "park-calm" },
      signals: { navPrice: "1135700000000000000", marketPrice: "1053000000000000000" },
    },
    payloadLoading: false,
  },
  {
    blockNumber: BigInt(2),
    txHash: "0xdd" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 2,
      timestamp: 1717003600,
      regime: "EARLY_DEPEG",
      decision: { action: "SWAP_TO_SAFE", reasonCode: "early-exit" },
      signals: { navPrice: "1135700000000000000", marketPrice: "1020000000000000000" },
    },
    payloadLoading: false,
  },
];

// The first axis-label overlay holds the TOP value, the last holds BOT, the
// middle one holds `mid <value>`. They render in document order top→mid→bot.
function axisLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".mono"))
    .map((el) => el.textContent ?? "")
    .filter((t) => /^\d|^mid /.test(t.trim()));
}

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

  it("auto-scales the Y-axis to bracket USDY/RWA-range data (top >= ~1.136, bottom <= ~1.045)", () => {
    const { container } = render(<ChartPanel entries={usdyEntries} />);

    // Paths still render and carry real geometry (not just an "M0,40" stub).
    const navPath = container.querySelector("path[stroke-dasharray='2,2']");
    const mktPath = container.querySelector("path[stroke='var(--ink-cyan-bright)']");
    expect(navPath?.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+ L/);
    expect(mktPath?.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+ L/);

    const labels = axisLabels(container);
    const top = parseFloat(labels[0]);
    const mid = parseFloat(labels[1].replace(/^mid\s*/, ""));
    const bot = parseFloat(labels[2]);

    // Window must bracket the data: nav ~1.1357 below top, lowest mkt ~1.020 above bottom.
    expect(top).toBeGreaterThanOrEqual(1.136);
    expect(bot).toBeLessThanOrEqual(1.045);
    expect(mid).toBeGreaterThan(bot);
    expect(mid).toBeLessThan(top);
    // Both real extremes fall inside the visible window.
    expect(1.1357).toBeLessThanOrEqual(top); // highest nav under top
    expect(1.02).toBeGreaterThanOrEqual(bot); // lowest mkt above bottom
  });

  it("falls back to roughly +/-0.005 (min-range floor) for a flat ~1.000 series", () => {
    const { container } = render(<ChartPanel entries={flatEntries} />);
    const labels = axisLabels(container);
    const top = parseFloat(labels[0]);
    const mid = parseFloat(labels[1].replace(/^mid\s*/, ""));
    const bot = parseFloat(labels[2]);

    expect(mid).toBeCloseTo(1.0, 6);
    expect(top).toBeCloseTo(1.005, 6);
    expect(bot).toBeCloseTo(0.995, 6);
  });
});
