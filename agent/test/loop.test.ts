import { describe, it, expect } from "vitest";
import { runTick, type VaultSender, type TickDeps } from "../src/loop";
import { ActionType, Regime, type AgentPolicy, type Address } from "../src/types";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../src/adapters/mocks";

const ONE = 10n ** 18n;
const ASSET = "0x1111111111111111111111111111111111111111" as Address;
const SAFE = "0x2222222222222222222222222222222222222222" as Address;

const ALL =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

const policy: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: ALL,
};

class RecordingSender implements VaultSender {
  public execCalls: Parameters<VaultSender["executeProtectiveAction"]>[0][] = [];
  public obsCalls: Parameters<VaultSender["attestObservation"]>[0][] = [];
  async executeProtectiveAction(a: Parameters<VaultSender["executeProtectiveAction"]>[0]) { this.execCalls.push(a); return "0xexec" as const; }
  async attestObservation(a: Parameters<VaultSender["attestObservation"]>[0]) { this.obsCalls.push(a); return "0xobs" as const; }
}

function deps(market: bigint, liquidity: bigint, balance: bigint, sender: RecordingSender): TickDeps {
  return {
    sources: {
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(market),
      liquidity: new MockLiquiditySource(liquidity),
      position: new MockPositionSource(balance),
    },
    policy,
    sender,
    addresses: { asset: ASSET, safeAsset: SAFE },
  };
}

describe("runTick", () => {
  it("CALM -> parks yield via executeProtectiveAction", async () => {
    const sender = new RecordingSender();
    const res = await runTick(deps(ONE, 0n, 100n * ONE, sender)); // market == nav -> CALM
    expect(res.decision.regime).toBe(Regime.CALM);
    expect(sender.execCalls).toHaveLength(1);
    expect(sender.execCalls[0]!.action).toBe(ActionType.PARK_YIELD);
    expect(sender.obsCalls).toHaveLength(0);
    expect(res.txHash).toBe("0xexec");
  });

  it("WATCH -> attests an observation (no fund movement)", async () => {
    const sender = new RecordingSender();
    const market = (ONE * 9970n) / 10000n; // 30 bps depeg -> WATCH
    const res = await runTick(deps(market, 0n, 100n * ONE, sender));
    expect(res.decision.regime).toBe(Regime.WATCH);
    expect(sender.obsCalls).toHaveLength(1);
    expect(sender.execCalls).toHaveLength(0);
    expect(res.txHash).toBe("0xobs");
  });

  it("EARLY_DEPEG with liquidity -> sends a swap with encoded params + bytes32 fields", async () => {
    const sender = new RecordingSender();
    const market = (ONE * 9900n) / 10000n; // 100 bps -> EARLY
    const res = await runTick(deps(market, 100n * ONE, 100n * ONE, sender));
    expect(res.decision.regime).toBe(Regime.EARLY_DEPEG);
    expect(sender.execCalls).toHaveLength(1);
    const call = sender.execCalls[0]!;
    expect(call.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(call.regime).toBe(Regime.EARLY_DEPEG);
    expect(call.params).toMatch(/^0x[0-9a-f]+$/);
    expect(call.reasonCode).toMatch(/^0x[0-9a-f]{64}$/);
    expect(call.signalsHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
