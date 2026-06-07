import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DepegStoryboard from "../src/components/DepegStoryboard";

describe("DepegStoryboard", () => {
  it("renders the depeg timeline from peg to collapse", () => {
    const { container } = render(<DepegStoryboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("$1.000"); // peg
    expect(text).toContain("$0.985"); // exit point
    expect(text).toContain("$0.10");  // collapse
    expect(text.toLowerCase()).toContain("anatomy_of_a_depeg");
  });

  it("highlights the Solvent exit and the contrast outcomes", () => {
    const { container } = render(<DepegStoryboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("Solvent exits");
    expect(text).toContain("down 1.5%");
    expect(text).toContain("down 90%");
    expect(text).toContain("$40B"); // footnote stakes
  });
});
