import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Panel from "../src/components/Panel";

describe("Panel", () => {
  it("renders four corner notches", () => {
    const { container } = render(<Panel>content</Panel>);
    expect(container.querySelectorAll('[data-corner]')).toHaveLength(4);
  });

  it("renders the title row when title and meta are provided", () => {
    render(<Panel title="// price_nav_feed · 24h" meta="[ CH-A ]">x</Panel>);
    expect(screen.getByText("// price_nav_feed · 24h")).toBeInTheDocument();
    expect(screen.getByText("[ CH-A ]")).toBeInTheDocument();
  });

  it("uses the solid panel background, never transparent", () => {
    const { container } = render(<Panel>x</Panel>);
    const root = container.firstChild as HTMLElement;
    // backgroundColor or background must reference --bg-panel (solid)
    const bg = root.style.background || root.style.backgroundColor;
    expect(bg).toMatch(/var\(--bg-panel\)|#0e1d3a/i);
  });
});
