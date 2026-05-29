import { describe, expect, it } from "vitest";
import { ConstantNavSource } from "../../src/adapters/ConstantNavSource";

describe("ConstantNavSource", () => {
  it("returns the configured constant", async () => {
    const src = new ConstantNavSource(1_000_000_000_000_000_000n);
    await expect(src.getNavPrice()).resolves.toBe(1_000_000_000_000_000_000n);
  });
});
