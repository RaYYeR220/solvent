import { describe, it, expect } from "vitest";
import { mockVault, mockPolicy, mockLog, PRESETS } from "../src/lib/mockData";

describe("mock fixtures", () => {
  it("vault state matches the canonical mockup numbers", () => {
    expect(mockVault.protectedPositionUsd).toBe(98540);
    expect(mockVault.usdyBalance).toBe(982.04);
    expect(mockVault.entryUsd).toBe(100000);
    expect(mockVault.deltaPct).toBe(0);
    expect(mockVault.address).toBe("0x7a4f…e1b3");
    expect(mockVault.regime).toBe("CALM");
  });

  it("policy fields match the policy panel in the mockup", () => {
    expect(mockPolicy.earlyTrigBps).toBe(50);
    expect(mockPolicy.termTrigBps).toBe(1000);
    expect(mockPolicy.maxLtvPct).toBe(50);
    expect(mockPolicy.safeAsset).toBe("USDC");
    expect(mockPolicy.slippageCapBps).toBe(300);
  });

  it("decision log has exactly 5 entries with one observe", () => {
    expect(mockLog).toHaveLength(5);
    const observeCount = mockLog.filter((e) => e.reasonCode === "observe").length;
    expect(observeCount).toBe(1);
  });

  it("exposes three policy presets", () => {
    expect(PRESETS).toHaveLength(3);
    expect(PRESETS.map((p) => p.id).sort()).toEqual(["aggressive", "balanced", "terminal-only"]);
  });
});
