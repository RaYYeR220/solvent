import { describe, it, expect } from "vitest";
import { createViemSender, type WriteClient } from "../src/executor/viemSender";
import { vaultAbi } from "../src/executor/vaultAbi";
import { ActionType, Regime, type Address } from "../src/types";

const VAULT = "0x1111111111111111111111111111111111111111" as Address;

class FakeWriteClient implements WriteClient {
  public calls: any[] = [];
  async writeContract(req: any): Promise<`0x${string}`> {
    this.calls.push(req);
    return "0xdeadbeef";
  }
  async waitForTransactionReceipt(_req: { hash: `0x${string}` }) {
    return { status: "success" as const, transactionHash: "0xdeadbeef" as `0x${string}` };
  }
}

describe("createViemSender", () => {
  it("calls writeContract with executeProtectiveAction args", async () => {
    const client = new FakeWriteClient();
    const sender = createViemSender(client, VAULT);
    const tx = await sender.executeProtectiveAction({
      action: ActionType.SWAP_TO_SAFE, params: "0x1234", regime: Regime.EARLY_DEPEG,
      reasonCode: ("0x" + "00".repeat(32)) as `0x${string}`, signalsHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      uri: "",
    });
    expect(tx).toBe("0xdeadbeef");
    expect(client.calls).toHaveLength(1);
    const req = client.calls[0];
    expect(req.address).toBe(VAULT);
    expect(req.abi).toBe(vaultAbi);
    expect(req.functionName).toBe("executeProtectiveAction");
    expect(req.args).toEqual([ActionType.SWAP_TO_SAFE, "0x1234", Regime.EARLY_DEPEG, ("0x" + "00".repeat(32)), ("0x" + "11".repeat(32)), ""]);
  });

  it("calls writeContract with attestObservation args", async () => {
    const client = new FakeWriteClient();
    const sender = createViemSender(client, VAULT);
    await sender.attestObservation({
      regime: Regime.WATCH, reasonCode: ("0x" + "00".repeat(32)) as `0x${string}`, signalsHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      uri: "",
    });
    expect(client.calls[0].functionName).toBe("attestObservation");
    expect(client.calls[0].args).toEqual([Regime.WATCH, ("0x" + "00".repeat(32)), ("0x" + "11".repeat(32)), ""]);
  });
});
