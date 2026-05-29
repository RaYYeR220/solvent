import { describe, expect, it } from "vitest";
import { buildAttestationPayload, serializePayload, payloadVersion } from "../../src/attestation/payload";
import { ActionType, Regime } from "../../src/types";
import type { Signals } from "../../src/types";

const signals: Signals = {
  navPrice: 1_000_000_000_000_000_000n,
  marketPrice: 999_000_000_000_000_000n,
  liquidityDepth: 0n,
  assetBalance: 100_000_000n,
  oracleDivergenceBps: 0,
  timestamp: 1_716_969_600,
};

describe("AttestationPayload", () => {
  it("includes version, agentId, vault, signals, regime, decision", () => {
    const p = buildAttestationPayload({
      tick: 42,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.CALM,
      decision: {
        regime: Regime.CALM,
        plan: { action: ActionType.PARK_YIELD, amount: 100_000_000n },
        reasonCode: "park-calm",
      },
      txHash: null,
    });
    expect(p.version).toBe(payloadVersion);
    expect(p.tick).toBe(42);
    expect(p.agentId).toBe("106");
    expect(p.vaultAddress).toBe("0x06513470e16a7d6071A12708c38a6fa0ED66469c");
    expect(p.signals.navPrice).toBe("1000000000000000000");
    expect(p.regime).toBe("CALM");
    expect(p.decision.action).toBe("PARK_YIELD");
    expect(p.decision.reasonCode).toBe("park-calm");
  });

  it("serializePayload returns deterministic JSON (sorted keys)", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.WATCH,
      decision: { regime: Regime.WATCH, plan: { action: ActionType.NONE }, reasonCode: "watch" },
      txHash: null,
    });
    const s1 = serializePayload(p);
    const s2 = serializePayload(p);
    expect(s1).toBe(s2);
    const idxAgentId = s1.indexOf('"agentId"');
    const idxTick = s1.indexOf('"tick"');
    expect(idxAgentId).toBeLessThan(idxTick);
  });

  it("encodes bigint signal fields as decimal strings", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.CALM,
      decision: { regime: Regime.CALM, plan: { action: ActionType.NONE }, reasonCode: "calm-idle" },
      txHash: null,
    });
    expect(typeof p.signals.navPrice).toBe("string");
    expect(p.signals.assetBalance).toBe("100000000");
  });

  it("emits action-specific plan fields", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.EARLY_DEPEG,
      decision: {
        regime: Regime.EARLY_DEPEG,
        plan: { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 100n, borrowAmount: 50n },
        reasonCode: "liquidity-bridge",
      },
      txHash: "0xdeadbeef" as `0x${string}`,
    });
    expect(p.decision.action).toBe("BRIDGE_VIA_LENDING");
    expect(p.decision.collateralAmount).toBe("100");
    expect(p.decision.borrowAmount).toBe("50");
    expect(p.txHash).toBe("0xdeadbeef");
  });
});
