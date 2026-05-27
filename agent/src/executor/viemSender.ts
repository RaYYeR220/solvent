import type { Address } from "../types";
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../loop";
import { vaultAbi } from "./vaultAbi";

/** The slice of a viem WalletClient we use (kept narrow so it's trivial to fake in tests). */
export interface WriteClient {
  writeContract(req: {
    address: Address;
    abi: typeof vaultAbi;
    functionName: "executeProtectiveAction" | "attestObservation";
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
}

/** Builds a VaultSender that submits txs to the on-chain vault via a viem write client. */
export function createViemSender(client: WriteClient, vault: Address): VaultSender {
  return {
    async executeProtectiveAction(a: ExecuteArgs): Promise<`0x${string}`> {
      return client.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "executeProtectiveAction",
        args: [a.action, a.params, a.regime, a.reasonCode, a.signalsHash],
      });
    },
    async attestObservation(a: ObserveArgs): Promise<`0x${string}`> {
      return client.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "attestObservation",
        args: [a.regime, a.reasonCode, a.signalsHash],
      });
    },
  };
}
