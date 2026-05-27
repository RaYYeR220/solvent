import { describe, it, expect } from "vitest";
import { AGENT_NAME, AGENT_VERSION } from "../src/version";

describe("scaffold", () => {
  it("exposes agent identity constants", () => {
    expect(AGENT_NAME).toBe("solvent-agent");
    expect(AGENT_VERSION).toBe("0.1.0");
  });
});
