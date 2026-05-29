import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/runtime/main";

describe("parseArgs", () => {
  it("defaults to --forever when no flag given", () => {
    expect(parseArgs([])).toEqual({ mode: "forever" });
  });

  it("recognises --once", () => {
    expect(parseArgs(["--once"])).toEqual({ mode: "once" });
  });

  it("recognises --forever", () => {
    expect(parseArgs(["--forever"])).toEqual({ mode: "forever" });
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--banana"])).toThrow(/unknown flag/i);
  });
});
