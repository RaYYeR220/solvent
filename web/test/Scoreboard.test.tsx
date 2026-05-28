import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Scoreboard from "../src/components/Scoreboard";

describe("Scoreboard", () => {
  it("renders the three labeled score lines", () => {
    render(<Scoreboard ai={98.5} human={78} hodl={10} />);
    expect(screen.getByText(/AI/)).toBeInTheDocument();
    expect(screen.getByText(/Human/)).toBeInTheDocument();
    expect(screen.getByText(/HODL/)).toBeInTheDocument();
    expect(screen.getByText("98.5%")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("highlights the AI line in cyan", () => {
    const { container } = render(<Scoreboard ai={98.5} human={78} hodl={10} />);
    const aiRow = container.querySelector('[data-row="ai"]') as HTMLElement | null;
    expect(aiRow).not.toBeNull();
    // value element inside should use --ink-cyan
    const aiValue = aiRow!.querySelector('[data-value]') as HTMLElement;
    expect(aiValue.style.color).toMatch(/var\(--ink-cyan\)|#7cd5ff/i);
  });
});
