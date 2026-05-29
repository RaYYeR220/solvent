import { describe, expect, it } from "vitest";
import { computeStorageSlot } from "../../src/scripts/anvilControl";

describe("computeStorageSlot", () => {
  it("computes mapping(address => uint256) slot", () => {
    const slot = computeStorageSlot({
      mappingSlot: 5n,
      key: "0xabcdefABCDEFabcdefABCDEFabcdefABCDEFabcd",
      keyType: "address",
    });
    expect(slot).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns a flat slot for plain storage (mappingSlot = undefined)", () => {
    const slot = computeStorageSlot({ flatSlot: 3n });
    expect(slot).toBe("0x" + "0".repeat(62) + "03");
  });
});
