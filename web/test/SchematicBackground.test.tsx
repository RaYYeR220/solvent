import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SchematicBackground from "../src/components/SchematicBackground";

describe("SchematicBackground", () => {
  it("renders all five decoration layers", () => {
    const { container } = render(<SchematicBackground />);
    // 2 divs (atmospheric wash, drafting grid) + 3 svgs (dots, pcb-traces, dimensions) = 5 layers
    const layers = container.querySelectorAll('[data-layer]');
    expect(layers).toHaveLength(5);
    expect(container.querySelector('[data-layer="atmospheric"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="grid"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="dots"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="pcb"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="dimensions"]')).not.toBeNull();
  });

  it("uses pointer-events: none on every layer so decoration cannot block clicks", () => {
    const { container } = render(<SchematicBackground />);
    const layers = container.querySelectorAll('[data-layer]');
    layers.forEach((l) => {
      expect((l as HTMLElement).style.pointerEvents).toBe("none");
    });
  });

  it("anchors every layer to the frame with position:absolute, inset:0, zIndex:0", () => {
    const { container } = render(<SchematicBackground />);
    const layers = container.querySelectorAll('[data-layer]');
    layers.forEach((l) => {
      const el = l as HTMLElement;
      expect(el.style.position).toBe("absolute");
      expect(el.style.inset).toMatch(/^0(px)?$/);
      expect(el.style.zIndex).toBe("0");
    });
  });
});
