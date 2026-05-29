import { describe, expect, it } from "vitest";
import { transientDepegScenario, terminalCollapseScenario } from "../../src/scripts/scenarios";

describe("transientDepegScenario", () => {
  it("name and tick count match the spec", () => {
    expect(transientDepegScenario.name).toBe("transient-depeg");
    expect(transientDepegScenario.steps).toHaveLength(8);
  });

  it("dips to $0.96 at tick 3, recovers by tick 7", () => {
    const t3 = transientDepegScenario.steps[3]!;
    expect(t3.oracleNav).toBe(1_000_000_000_000_000_000n);
    expect(t3.marketPrice).toBe(960_000_000_000_000_000n);
    const t7 = transientDepegScenario.steps[7]!;
    expect(t7.marketPrice).toBe(1_000_000_000_000_000_000n);
  });
});

describe("terminalCollapseScenario", () => {
  it("name and tick count match the spec", () => {
    expect(terminalCollapseScenario.name).toBe("terminal-collapse");
    expect(terminalCollapseScenario.steps).toHaveLength(8);
  });

  it("collapses to $0.50 by tick 4 and stays there", () => {
    const t4 = terminalCollapseScenario.steps[4]!;
    expect(t4.marketPrice).toBe(500_000_000_000_000_000n);
    const t7 = terminalCollapseScenario.steps[7]!;
    expect(t7.marketPrice).toBe(500_000_000_000_000_000n);
  });
});
