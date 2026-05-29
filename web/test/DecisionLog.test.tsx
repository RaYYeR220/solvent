import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DecisionLog from "../src/components/DecisionLog";
import { mockLog, mockVault } from "../src/lib/mockData";

describe("DecisionLog", () => {
  it("renders all 5 entries with timestamps and tx hashes", () => {
    render(<DecisionLog entries={mockLog} attestationsAttested={mockVault.attestationsAttested} attestationsTotal={mockVault.attestationsTotal} />);
    for (const entry of mockLog) {
      expect(screen.getByText(entry.timestamp)).toBeInTheDocument();
      expect(screen.getByText(entry.txShort)).toBeInTheDocument();
    }
  });

  it("highlights the observe row in warm gold", () => {
    const { container } = render(<DecisionLog entries={mockLog} attestationsAttested={11} attestationsTotal={11} />);
    const observeRow = container.querySelector('[data-row="observe"]') as HTMLElement | null;
    expect(observeRow).not.toBeNull();
    // background should reference the observe tint
    expect(observeRow!.style.background).toMatch(/var\(--observe-tint\)|rgba\(232, ?192, ?96/);
  });

  it("shows the attestation count meta", () => {
    render(<DecisionLog entries={mockLog} attestationsAttested={11} attestationsTotal={11} />);
    expect(screen.getByText(/11\/11 attested/)).toBeInTheDocument();
  });
});
