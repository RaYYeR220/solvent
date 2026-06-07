import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TrustModel from "../src/components/TrustModel";

describe("TrustModel", () => {
  it("renders the three-node agent → vault → attestation flow", () => {
    const { container } = render(<TrustModel />);
    const text = container.textContent ?? "";
    expect(text.toLowerCase()).toContain("agent");
    expect(text.toLowerCase()).toContain("vault · action surface");
    expect(text.toLowerCase()).toContain("erc-8004 attestation");
  });

  it("states the non-custodial guarantee", () => {
    const { container } = render(<TrustModel />);
    const text = container.textContent ?? "";
    expect(text).toContain("Non-custodial by construction");
    expect(text.toLowerCase()).toContain("trust_model");
  });
});
