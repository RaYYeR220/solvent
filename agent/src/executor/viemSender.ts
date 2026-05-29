import type { Address } from "../types";
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../loop";
import { vaultAbi } from "./vaultAbi";

/** The slice of a viem client we use. In production this is one viem WalletClient
 *  extended via `.extend(publicActions)` (see adapters/viemClients.ts) so it
 *  exposes both WalletActions.writeContract AND PublicActions.waitForTransactionReceipt
 *  on the same object. Kept narrow here so it's trivial to fake in tests. */
export interface WriteClient {
  writeContract(req: {
    address: Address;
    abi: typeof vaultAbi;
    functionName: "executeProtectiveAction" | "attestObservation";
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
  waitForTransactionReceipt(req: { hash: `0x${string}` }): Promise<{
    status: "success" | "reverted";
    transactionHash: `0x${string}`;
  }>;
}

async function sendAndWait(
  client: WriteClient,
  vault: Address,
  functionName: "executeProtectiveAction" | "attestObservation",
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const hash = await client.writeContract({ address: vault, abi: vaultAbi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`vault.${functionName} reverted (tx ${receipt.transactionHash})`);
  }
  return receipt.transactionHash;
}

/** Builds a VaultSender that submits txs and awaits receipts. */
export function createViemSender(client: WriteClient, vault: Address): VaultSender {
  return {
    executeProtectiveAction: (a: ExecuteArgs) => sendAndWait(
      client, vault, "executeProtectiveAction",
      [a.action, a.params, a.regime, a.reasonCode, a.signalsHash, a.uri],
    ),
    attestObservation: (a: ObserveArgs) => sendAndWait(
      client, vault, "attestObservation",
      [a.regime, a.reasonCode, a.signalsHash, a.uri],
    ),
  };
}
