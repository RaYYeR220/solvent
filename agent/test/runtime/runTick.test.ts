import { describe, expect, it, vi } from "vitest";
import { runTick } from "../../src/runtime/runTick";
import { ActionType, Regime } from "../../src/types";
import type { AgentPolicy } from "../../src/types";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../../src/adapters/mocks";

const policy: AgentPolicy = {
  watchDivergenceBps: 20,
  earlyDivergenceBps: 50,
  terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 100,
  liquidityFloor: 0n,
  maxSlippageBps: 300,
  maxBridgeLTVBps: 5000,
  assetDecimals: 6,
  safeDecimals: 6,
  allowedActions: 0b11110,
};

function fakeSender() {
  return {
    executeProtectiveAction: vi.fn().mockResolvedValue("0xexec" as `0x${string}`),
    attestObservation: vi.fn().mockResolvedValue("0xobs" as `0x${string}`),
  };
}

function fakePinner(uri: string) {
  return vi.fn().mockResolvedValue(uri);
}

const VAULT = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";
const ASSET = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const SAFE = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

describe("runTick", () => {
  it("CALM regime + balance > 0 → executeProtectiveAction(PARK_YIELD) with URI", async () => {
    const sender = fakeSender();
    const pinner = fakePinner("ipfs://QmCALM");
    const res = await runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 1,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(res.decision.plan.action).toBe(ActionType.PARK_YIELD);
    expect(res.txHash).toBe("0xexec");
    expect(sender.executeProtectiveAction).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "ipfs://QmCALM" }),
    );
  });

  it("WATCH regime → attestObservation with URI (no on-chain action)", async () => {
    const sender = fakeSender();
    const pinner = fakePinner("ipfs://QmWATCH");
    const nav = 1_000_000_000_000_000_000n;
    const market = 997_000_000_000_000_000n;
    const res = await runTick({
      sources: {
        nav: new MockNavSource(nav),
        price: new MockPriceSource(market),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 2,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(res.decision.regime).toBe(Regime.WATCH);
    expect(sender.attestObservation).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "ipfs://QmWATCH" }),
    );
    expect(sender.executeProtectiveAction).not.toHaveBeenCalled();
  });

  it("propagates pinner errors as tick failure", async () => {
    const sender = fakeSender();
    const pinner = vi.fn().mockRejectedValue(new Error("Pinata 503"));
    await expect(runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 3,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    })).rejects.toThrow("Pinata 503");
  });

  it("includes txHash in the URI payload only after the on-chain write", async () => {
    const callOrder: string[] = [];
    const sender = {
      executeProtectiveAction: vi.fn().mockImplementation(async () => {
        callOrder.push("write");
        return "0xexec" as `0x${string}`;
      }),
      attestObservation: vi.fn(),
    };
    const pinner = vi.fn().mockImplementation(async () => {
      callOrder.push("pin");
      return "ipfs://QmORDER";
    });
    await runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy, sender, pinner, tick: 4, agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(callOrder).toEqual(["pin", "write"]);
  });
});
