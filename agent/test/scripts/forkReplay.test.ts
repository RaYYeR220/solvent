import { describe, expect, it } from "vitest";
import { replay } from "../../src/scripts/forkReplay";
import { transientDepegScenario, terminalCollapseScenario } from "../../src/scripts/scenarios";
import { Regime } from "../../src/types";

describe("forkReplay.replay", () => {
  it("transient-depeg: agent reacts in EARLY_DEPEG window then idles after recovery", async () => {
    const out = await replay(transientDepegScenario);
    expect(out.scenario).toBe("transient-depeg");
    expect(out.ticks).toHaveLength(8);
    const earlyTick = out.ticks.find((t) => t.regime === "EARLY_DEPEG");
    expect(earlyTick).toBeDefined();
    expect(earlyTick.action).not.toBe("NONE");
  });

  it("terminal-collapse: agent fires terminal-exit on first depeg tick (flash crash)", async () => {
    const out = await replay(terminalCollapseScenario);
    const termTick = out.ticks.find((t) => t.regime === "TERMINAL_DEPEG");
    expect(termTick).toBeDefined();
    expect(termTick.action).toBe("SWAP_TO_SAFE");
    expect(termTick.reasonCode).toBe("terminal-exit");
    // postActionBalance is 0 (agent exited)
    expect(BigInt(termTick.postActionBalance)).toBe(0n);
    // Subsequent ticks confirm agent stays out
    const after = out.ticks.find((t) => t.tick > termTick.tick);
    expect(BigInt(after.signals.assetBalance)).toBe(0n);
  });
});
