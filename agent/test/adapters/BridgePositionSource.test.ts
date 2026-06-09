import { describe, expect, it, vi } from "vitest";
import { BridgePositionSource } from "../../src/adapters/BridgePositionSource";
import type { Address } from "../../src/types";

const VAULT: Address = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";
const VENUE: Address = "0xFCFE742e19790Dd67a627875ef8b45F17DB1DaC6";
const ZERO: Address = "0x0000000000000000000000000000000000000000";

const SAFE: Address = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

// policy() tuple in declaration order; safeAsset index 4, bridgeVenue index 5.
function policyTuple(bridgeVenue: Address) {
  return [50, 500, 0n, 300, SAFE, bridgeVenue, 5000, 14];
}

function client(handlers: Record<string, unknown>) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => handlers[functionName]),
  } as any;
}

describe("BridgePositionSource", () => {
  it("returns null when no bridge venue is set", async () => {
    const c = client({ policy: policyTuple(ZERO) });
    const src = new BridgePositionSource(c, VAULT);
    await expect(src.getBridgedPosition()).resolves.toBeNull();
  });

  it("returns null when a venue is set but no position is open (collateral 0)", async () => {
    const c = client({ policy: policyTuple(VENUE), collateralUnderlying: 0n, debtUnderlying: 0n, balanceOf: 0n });
    const src = new BridgePositionSource(c, VAULT);
    await expect(src.getBridgedPosition()).resolves.toBeNull();
  });

  it("returns the open position's collateral + debt + vault safe balance", async () => {
    const c = client({
      policy: policyTuple(VENUE),
      collateralUnderlying: 5000n * 10n ** 18n,
      debtUnderlying: 2500n * 10n ** 6n,
      balanceOf: 2505n * 10n ** 6n,
    });
    const src = new BridgePositionSource(c, VAULT);
    await expect(src.getBridgedPosition()).resolves.toEqual({
      collateral: 5000n * 10n ** 18n,
      debt: 2500n * 10n ** 6n,
      safeBalance: 2505n * 10n ** 6n,
    });
  });
});
