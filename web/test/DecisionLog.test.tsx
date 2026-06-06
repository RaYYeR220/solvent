import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DecisionLog from "../src/components/DecisionLog";
import { mockLog, mockVault, type LogEntry } from "../src/lib/mockData";

describe("DecisionLog", () => {
  it("renders all 5 entries with timestamps and tx hashes", () => {
    render(<DecisionLog entries={mockLog} attestationsTotal={mockVault.attestationsTotal} />);
    for (const entry of mockLog) {
      expect(screen.getByText(entry.timestamp)).toBeInTheDocument();
      expect(screen.getByText(entry.txShort)).toBeInTheDocument();
    }
  });

  it("highlights the observe row in warm gold", () => {
    const { container } = render(<DecisionLog entries={mockLog} attestationsTotal={11} />);
    const observeRow = container.querySelector('[data-row="observe"]') as HTMLElement | null;
    expect(observeRow).not.toBeNull();
    // background should reference the observe tint
    expect(observeRow!.style.background).toMatch(/var\(--observe-tint\)|rgba\(232, ?192, ?96/);
  });

  it("shows the attestation count meta", () => {
    render(<DecisionLog entries={mockLog} attestationsTotal={11} />);
    expect(screen.getByText(/11 attested/)).toBeInTheDocument();
  });
});

describe("DecisionLog with txHash", () => {
  it("renders txShort as an external MantleScan link when txHash is provided", () => {
    const entries: LogEntry[] = [{
      timestamp: "14:02",
      reasonCode: "park-calm",
      description: "yield deployed",
      txShort: "0x84…f2",
      txHash: "0x84abc",
    }];
    const { container } = render(
      <DecisionLog entries={entries} attestationsTotal={1} />,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toContain("/tx/0x84abc");
  });
});
