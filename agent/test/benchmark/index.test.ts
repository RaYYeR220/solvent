import { describe, it, expect } from "vitest";
import { toScoreboardJson } from "../../src/benchmark/index";
import type { BenchmarkReport } from "../../src/benchmark/types";
import { ActionType, Regime } from "../../src/types";

const report: BenchmarkReport = {
  scenarios: [
    {
      name: "demo", description: "d",
      results: [
        {
          scenarioName: "demo", strategyName: "solvent-ai",
          initialValue: 1000n * 10n ** 6n, finalValue: 985n * 10n ** 6n, pctPreservedBps: 9850,
          log: [{ timestamp: 0, regime: Regime.EARLY_DEPEG, action: ActionType.SWAP_TO_SAFE, reasonCode: "early-exit", valueAfter: 985n * 10n ** 6n }],
        },
      ],
    },
  ],
};

describe("toScoreboardJson", () => {
  it("serializes bigints as decimal strings and stamps generatedAt", () => {
    const json = toScoreboardJson(report, 1700000000);
    const parsed = JSON.parse(json);
    expect(parsed.generatedAt).toBe(1700000000);
    expect(parsed.scenarios[0].results[0].finalValue).toBe("985000000");
    expect(parsed.scenarios[0].results[0].pctPreservedBps).toBe(9850);
    expect(parsed.scenarios[0].results[0].log[0].valueAfter).toBe("985000000");
  });
});
