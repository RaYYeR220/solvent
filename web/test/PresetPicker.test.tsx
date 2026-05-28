import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PresetPicker from "../src/components/PresetPicker";

describe("PresetPicker", () => {
  it("renders all three presets", () => {
    render(<PresetPicker selected="balanced" onSelect={() => {}} />);
    expect(screen.getByText("Aggressive")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByText("Terminal-only")).toBeInTheDocument();
  });

  it("fires onSelect with the preset id when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<PresetPicker selected="balanced" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Aggressive"));
    expect(onSelect).toHaveBeenCalledWith("aggressive");
  });

  it("marks the currently-selected card with aria-pressed=true", () => {
    render(<PresetPicker selected="terminal-only" onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: /Terminal-only/ });
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });
});
