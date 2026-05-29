import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";

/** Read-only client for Mantle. */
export function createReadClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: mantle, transport: http(rpcUrl) });
}

/** Write client bound to a private key. The `account` is non-optional so
 *  callers can read `client.account.address` without narrowing. */
export type AgentWalletClient = WalletClient & { account: Account };

export function createWriteClient(rpcUrl: string, privateKey: `0x${string}`): AgentWalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: mantle, transport: http(rpcUrl) }) as AgentWalletClient;
}
