import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Providers } from "../../src/lib/providers";

describe("Providers", () => {
  it("renders children inside the provider tree without throwing", () => {
    const { getByText } = render(
      <Providers>
        <div>solvent</div>
      </Providers>,
    );
    expect(getByText("solvent")).toBeTruthy();
  });
});
