import { describe, expect, it, vi } from "vitest";
import { OndoNavSource } from "../../src/adapters/OndoNavSource";
import type { Address } from "../../src/types";

const ORACLE: Address = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f";

function fakeClient(returnValue: bigint) {
  return { readContract: vi.fn().mockResolvedValue(returnValue) } as any;
}

describe("OndoNavSource", () => {
  it("returns the value from RWADynamicOracle.getPrice", async () => {
    const c = fakeClient(1_010_000_000_000_000_000n);
    const src = new OndoNavSource(c, ORACLE);
    await expect(src.getNavPrice()).resolves.toBe(1_010_000_000_000_000_000n);
    expect(c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: ORACLE, functionName: "getPrice",
    }));
  });

  it("propagates RPC errors", async () => {
    const c = { readContract: vi.fn().mockRejectedValue(new Error("RPC down")) } as any;
    const src = new OndoNavSource(c, ORACLE);
    await expect(src.getNavPrice()).rejects.toThrow("RPC down");
  });
});
