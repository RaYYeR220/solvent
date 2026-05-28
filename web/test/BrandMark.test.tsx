import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BrandMark from "../src/components/BrandMark";

describe("BrandMark", () => {
  it("renders at the default 32px size", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("respects the size prop", () => {
    const { container } = render(<BrandMark size={48} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
  });

  it("exposes the brand name via aria-label and role=img", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Solvent");
    expect(svg?.getAttribute("role")).toBe("img");
  });
});
