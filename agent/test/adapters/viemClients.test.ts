import { describe, expect, it } from "vitest";
import { createReadClient, createWriteClient } from "../../src/adapters/viemClients";

const PK = "0x" + "11".repeat(32) as `0x${string}`;
const RPC = "https://rpc.mantle.xyz";

describe("viemClients", () => {
  it("createReadClient binds to Mantle chain (id 5000)", () => {
    const c = createReadClient(RPC);
    expect(c.chain?.id).toBe(5000);
  });

  it("createWriteClient exposes the agent account address", () => {
    const c = createWriteClient(RPC, PK);
    expect(c.account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("createWriteClient binds to Mantle chain (id 5000)", () => {
    const c = createWriteClient(RPC, PK);
    expect(c.chain?.id).toBe(5000);
  });
});
