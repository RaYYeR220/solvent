import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HeroStat from "../src/components/HeroStat";
import { mockVault } from "../src/lib/mockData";

describe("HeroStat", () => {
  it("renders the protected position label and value", () => {
    render(<HeroStat vault={mockVault} />);
    expect(screen.getByText("// protected_position")).toBeInTheDocument();
    expect(screen.getByText("$98,540")).toBeInTheDocument();
  });

  it("shows status pills with regime, tick, attestations", () => {
    render(<HeroStat vault={mockVault} />);
    expect(screen.getByText(/AGENT:LIVE/)).toBeInTheDocument();
    expect(screen.getByText("REGIME:CALM")).toBeInTheDocument();
    expect(screen.getByText("DIV:0bps")).toBeInTheDocument();
    expect(screen.getByText("TICK:14:02")).toBeInTheDocument();
    expect(screen.getByText("ATTEST:11/11")).toBeInTheDocument();
  });

  it("renders the sub-meta line with USDY balance, entry, and delta", () => {
    render(<HeroStat vault={mockVault} />);
    expect(screen.getByText(/982\.04 USDY/)).toBeInTheDocument();
    expect(screen.getByText(/entry \$100,000/)).toBeInTheDocument();
    expect(screen.getByText(/\+0\.0%/)).toBeInTheDocument();
  });
});
