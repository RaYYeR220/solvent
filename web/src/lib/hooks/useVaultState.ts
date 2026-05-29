"use client";

import { useReadContracts, useReadContract } from "wagmi";
import { CONTRACTS, vaultAbi, erc20Abi } from "../contracts";
import type { Address } from "viem";

export interface VaultStateLive {
  asset: Address;
  agent: Address;
  agentId: bigint;
  owner: Address;
  killSwitch: boolean;
  assetBalance: bigint;
  address: string;
  isLoading: boolean;
  isError: boolean;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function useVaultState(): VaultStateLive {
  const batch = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "asset" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agent" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agentId" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "owner" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "killSwitch" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const balance = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const r = batch.data;
  return {
    asset: (r?.[0]?.result as Address | undefined) ?? CONTRACTS.asset,
    agent: (r?.[1]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    agentId: (r?.[2]?.result as bigint | undefined) ?? CONTRACTS.agentId,
    owner: (r?.[3]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    killSwitch: Boolean(r?.[4]?.result ?? false),
    assetBalance: (balance.data as bigint | undefined) ?? BigInt(0),
    address: shortAddr(CONTRACTS.vault),
    isLoading: batch.isLoading || balance.isLoading,
    isError: batch.isError || balance.isError,
  };
}
