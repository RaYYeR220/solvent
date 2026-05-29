import { describe, expect, it, vi } from "vitest";
import { VaultPositionSource } from "../../src/adapters/VaultPositionSource";
import type { Address } from "../../src/types";

const ASSET: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const VAULT: Address = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";

function fakeClient(balance: bigint) {
  return { readContract: vi.fn().mockResolvedValue(balance) } as any;
}

describe("VaultPositionSource", () => {
  it("returns ERC20.balanceOf(vault)", async () => {
    const c = fakeClient(1_500_000n);
    const src = new VaultPositionSource(c, ASSET, VAULT);
    await expect(src.getAssetBalance()).resolves.toBe(1_500_000n);
    expect(c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: ASSET, functionName: "balanceOf", args: [VAULT],
    }));
  });
});
