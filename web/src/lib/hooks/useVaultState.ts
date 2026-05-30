"use client";

import { useReadContracts, useReadContract, useAccount } from "wagmi";
import { CONTRACTS, vaultAbi, erc20Abi } from "../contracts";
import type { Address } from "viem";

export interface VaultStateLive {
  asset: Address;
  agent: Address;
  agentId: bigint;
  owner: Address;
  killSwitch: boolean;
  /** Vault's total asset value (risk + safe at 1:1), in asset-decimal units. */
  totalAssets: bigint;
  /** Vault's raw risk-asset balance, asset-decimal units. */
  riskAssetBalance: bigint;
  /** Vault's raw safe-asset balance, safe-decimal units. */
  safeAssetBalance: bigint;
  /** Connected wallet's share balance (svUSDT0), share-decimal units. */
  userShares: bigint;
  /** Truncated vault address suitable for display. */
  address: string;
  isLoading: boolean;
  isError: boolean;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function useVaultState(): VaultStateLive {
  const { address: connected } = useAccount();

  const batch = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "asset" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agent" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agentId" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "owner" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "killSwitch" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "totalAssets" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const riskBal = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const safeBal = useReadContract({
    address: CONTRACTS.safeAsset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const userShareBal = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: connected ? [connected] : undefined,
    query: { enabled: !!connected, refetchInterval: 12_000 },
  });

  const r = batch.data;
  return {
    asset: (r?.[0]?.result as Address | undefined) ?? CONTRACTS.asset,
    agent: (r?.[1]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    agentId: (r?.[2]?.result as bigint | undefined) ?? CONTRACTS.agentId,
    owner: (r?.[3]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    killSwitch: Boolean(r?.[4]?.result ?? false),
    totalAssets: (r?.[5]?.result as bigint | undefined) ?? BigInt(0),
    riskAssetBalance: (riskBal.data as bigint | undefined) ?? BigInt(0),
    safeAssetBalance: (safeBal.data as bigint | undefined) ?? BigInt(0),
    userShares: connected ? ((userShareBal.data as bigint | undefined) ?? BigInt(0)) : BigInt(0),
    address: shortAddr(CONTRACTS.vault),
    isLoading: batch.isLoading || riskBal.isLoading || safeBal.isLoading,
    isError: batch.isError || riskBal.isError || safeBal.isError,
  };
}
