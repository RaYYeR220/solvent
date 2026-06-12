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
  /** Risk-asset token decimals, read from chain (e.g. 6 for USDT0, 18 for USDY). */
  assetDecimals: number;
  /** Vault share (ERC4626) decimals, read from chain. */
  shareDecimals: number;
  /** Safe-asset token decimals, read from chain (e.g. 6 for USDC). */
  safeDecimals: number;
  /** Risk-asset token symbol, read from chain (e.g. "USDT0" mainnet, "USDY" fork). */
  assetSymbol: string;
  /** Vault share (ERC4626) symbol, read from chain (e.g. "svUSDT0"). */
  shareSymbol: string;
  /** Safe-asset token symbol, read from chain (e.g. "USDC"). */
  safeSymbol: string;
  /** True until the on-chain decimals reads have resolved. Render guards
   *  should suppress numeric displays while this is true to avoid a flash of
   *  wrong-magnitude numbers (decimals default to 18, not 6). */
  decimalsLoading: boolean;
  /** True until the on-chain symbol reads have resolved. Consumers should
   *  prefer an empty/placeholder label over a wrong hardcoded one while true. */
  symbolsLoading: boolean;
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
      // Decimals read from chain so the dashboard is correct for ANY asset.
      // Index 6: risk-asset decimals, 7: share (ERC4626) decimals, 8: safe-asset decimals.
      { address: CONTRACTS.asset, abi: erc20Abi, functionName: "decimals" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "decimals" },
      { address: CONTRACTS.safeAsset, abi: erc20Abi, functionName: "decimals" },
      // Symbols read from chain so labels are correct for ANY vault (USDT0 on
      // mainnet, USDY on a fork, …) — never hardcoded.
      // Index 9: risk-asset symbol, 10: share symbol, 11: safe-asset symbol.
      { address: CONTRACTS.asset, abi: erc20Abi, functionName: "symbol" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "symbol" },
      { address: CONTRACTS.safeAsset, abi: erc20Abi, functionName: "symbol" },
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
  const assetDecimalsRaw = r?.[6]?.result as number | undefined;
  const shareDecimalsRaw = r?.[7]?.result as number | undefined;
  const safeDecimalsRaw = r?.[8]?.result as number | undefined;
  const assetSymbolRaw = r?.[9]?.result as string | undefined;
  const shareSymbolRaw = r?.[10]?.result as string | undefined;
  const safeSymbolRaw = r?.[11]?.result as string | undefined;
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
    // Default to 18 (not 6) while loading so a slow read never flashes huge
    // numbers; `decimalsLoading` lets consumers suppress output until resolved.
    assetDecimals: assetDecimalsRaw ?? 18,
    shareDecimals: shareDecimalsRaw ?? 18,
    safeDecimals: safeDecimalsRaw ?? 18,
    // Symbols default to "" while loading — consumers show a placeholder ("…")
    // rather than a wrong hardcoded "USDT0" before the read resolves. An optional
    // NEXT_PUBLIC_*_SYMBOL env override takes precedence (used on the fork demo,
    // where the V2.1 vault's on-chain share symbol is still "svUSDT0" but the
    // asset is USDY — the override relabels shares as "svUSDY"). Prod leaves these
    // unset, so it reads the true on-chain symbols.
    assetSymbol: process.env.NEXT_PUBLIC_ASSET_SYMBOL || (assetSymbolRaw ?? ""),
    shareSymbol: process.env.NEXT_PUBLIC_SHARE_SYMBOL || (shareSymbolRaw ?? ""),
    safeSymbol: process.env.NEXT_PUBLIC_SAFE_SYMBOL || (safeSymbolRaw ?? ""),
    decimalsLoading: assetDecimalsRaw === undefined || shareDecimalsRaw === undefined,
    symbolsLoading:
      (process.env.NEXT_PUBLIC_ASSET_SYMBOL ? false : assetSymbolRaw === undefined) ||
      (process.env.NEXT_PUBLIC_SHARE_SYMBOL ? false : shareSymbolRaw === undefined),
    address: shortAddr(CONTRACTS.vault),
    isLoading: batch.isLoading || riskBal.isLoading || safeBal.isLoading,
    isError: batch.isError || riskBal.isError || safeBal.isError,
  };
}
