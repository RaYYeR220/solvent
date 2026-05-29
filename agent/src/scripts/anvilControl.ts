import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import type { Address } from "../types";

/** anvil_setStorageAt slot computation helper.
 *  Either pass `{flatSlot: n}` for plain storage variables, or
 *  `{mappingSlot: n, key, keyType}` for a `mapping(K=>V)` lookup. */
export function computeStorageSlot(args: {
  flatSlot?: bigint;
  mappingSlot?: bigint;
  key?: string;
  keyType?: "address" | "uint256";
}): `0x${string}` {
  if (args.flatSlot !== undefined) {
    return pad(toHex(args.flatSlot), { size: 32 });
  }
  if (args.mappingSlot === undefined || args.key === undefined || !args.keyType) {
    throw new Error("computeStorageSlot needs either flatSlot or {mappingSlot, key, keyType}");
  }
  const encodedKey = args.keyType === "address"
    ? encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [args.key.toLowerCase() as Address, args.mappingSlot])
    : encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(args.key), args.mappingSlot]);
  return keccak256(encodedKey);
}

/** Spawn anvil as a background child process forked from Mantle. The caller
 *  is responsible for killing it. */
export interface AnvilHandle {
  rpcUrl: string;
  stop(): void;
}

export async function spawnAnvil(forkUrl: string, forkBlock?: number): Promise<AnvilHandle> {
  const { spawn } = await import("node:child_process");
  const args = ["--fork-url", forkUrl, "--port", "8545"];
  if (forkBlock !== undefined) args.push("--fork-block-number", String(forkBlock));
  const child = spawn("anvil", args, { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("anvil failed to start in 10s")), 10_000);
    child.stdout?.on("data", (buf: Buffer) => {
      if (buf.toString().includes("Listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
  return {
    rpcUrl: "http://127.0.0.1:8545",
    stop: () => { child.kill("SIGTERM"); },
  };
}

/** Set a storage slot on the local anvil via JSON-RPC. */
export async function setStorageAt(rpcUrl: string, address: Address, slot: `0x${string}`, value: `0x${string}`): Promise<void> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "anvil_setStorageAt",
      params: [address, slot, pad(value, { size: 32 })],
    }),
  });
  if (!res.ok) throw new Error(`anvil_setStorageAt failed: ${res.status}`);
}
