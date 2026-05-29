import { describe, expect, it, vi } from "vitest";
import { createViemSender } from "../../src/executor/viemSender";
import { vaultAbi } from "../../src/executor/vaultAbi";
import type { Address } from "../../src/types";

const VAULT: Address = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";

function fakeWallet() {
  return {
    writeContract: vi.fn().mockResolvedValue("0xabc" as `0x${string}`),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", transactionHash: "0xabc" }),
    estimateContractGas: vi.fn().mockResolvedValue(200_000n),
  } as any;
}

describe("createViemSender", () => {
  it("executeProtectiveAction threads uri to vault.executeProtectiveAction", async () => {
    const w = fakeWallet();
    const sender = createViemSender(w, VAULT);
    const hash = await sender.executeProtectiveAction({
      action: 4,
      params: "0x",
      regime: 0,
      reasonCode: "0x70617263616c6d000000000000000000000000000000000000000000000000" as `0x${string}`,
      signalsHash: "0xdead" + "0".repeat(60) as `0x${string}`,
      uri: "ipfs://QmTEST",
    });
    expect(hash).toBe("0xabc");
    expect(w.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      address: VAULT,
      functionName: "executeProtectiveAction",
      args: [4, "0x", 0, expect.any(String), expect.any(String), "ipfs://QmTEST"],
    }));
  });

  it("attestObservation threads uri to vault.attestObservation", async () => {
    const w = fakeWallet();
    const sender = createViemSender(w, VAULT);
    const hash = await sender.attestObservation({
      regime: 1,
      reasonCode: "0x77617463680000000000000000000000000000000000000000000000000000" as `0x${string}`,
      signalsHash: "0xbeef" + "0".repeat(60) as `0x${string}`,
      uri: "data:application/json;base64,e30=",
    });
    expect(hash).toBe("0xabc");
    expect(w.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "attestObservation",
      args: [1, expect.any(String), expect.any(String), "data:application/json;base64,e30="],
    }));
  });

  it("vaultAbi function executeProtectiveAction has 6 inputs including uri", () => {
    const fn = vaultAbi.find((e: any) => e.type === "function" && e.name === "executeProtectiveAction") as any;
    expect(fn).toBeDefined();
    expect(fn.inputs).toHaveLength(6);
    expect(fn.inputs[5]).toEqual(expect.objectContaining({ name: "uri", type: "string" }));
  });

  it("vaultAbi function attestObservation has 4 inputs including uri", () => {
    const fn = vaultAbi.find((e: any) => e.type === "function" && e.name === "attestObservation") as any;
    expect(fn).toBeDefined();
    expect(fn.inputs).toHaveLength(4);
    expect(fn.inputs[3]).toEqual(expect.objectContaining({ name: "uri", type: "string" }));
  });

  it("waits for tx receipt and surfaces a revert as a thrown error", async () => {
    const w = fakeWallet();
    w.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", transactionHash: "0xbad" });
    const sender = createViemSender(w, VAULT);
    await expect(sender.executeProtectiveAction({
      action: 4, params: "0x", regime: 0,
      reasonCode: "0x" + "00".repeat(32) as `0x${string}`,
      signalsHash: "0x" + "00".repeat(32) as `0x${string}`,
      uri: "",
    })).rejects.toThrow(/reverted/i);
  });

  it("bubbles up writeContract rejections (network/gas-estimation errors)", async () => {
    const w = fakeWallet();
    w.writeContract.mockRejectedValueOnce(new Error("nonce too low"));
    const sender = createViemSender(w, VAULT);
    await expect(sender.attestObservation({
      regime: 0,
      reasonCode: "0x" + "00".repeat(32) as `0x${string}`,
      signalsHash: "0x" + "00".repeat(32) as `0x${string}`,
      uri: "",
    })).rejects.toThrow(/nonce too low/);
    expect(w.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it("bubbles up waitForTransactionReceipt rejections (timeout, replacement)", async () => {
    const w = fakeWallet();
    w.waitForTransactionReceipt.mockRejectedValueOnce(new Error("WaitForTransactionReceiptTimeoutError"));
    const sender = createViemSender(w, VAULT);
    await expect(sender.attestObservation({
      regime: 0,
      reasonCode: "0x" + "00".repeat(32) as `0x${string}`,
      signalsHash: "0x" + "00".repeat(32) as `0x${string}`,
      uri: "",
    })).rejects.toThrow(/Timeout/);
  });
});
