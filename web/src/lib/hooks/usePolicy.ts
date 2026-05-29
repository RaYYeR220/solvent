"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, vaultAbi } from "../contracts";
import type { Address } from "viem";

export interface PolicyLive {
  earlyDivergenceBps: number;
  terminalDivergenceBps: number;
  liquidityFloor: bigint;
  maxSlippageBps: number;
  safeAsset: Address;
  bridgeVenue: Address;
  maxBridgeLTVBps: number;
  allowedActions: number;
  isLoading: boolean;
  isError: boolean;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";

export function usePolicy(): PolicyLive {
  const { data, isLoading, isError } = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "policy",
    query: { refetchInterval: 12_000 },
  });

  const t = (data ?? []) as readonly unknown[];
  return {
    earlyDivergenceBps: (t[0] as number | undefined) ?? 0,
    terminalDivergenceBps: (t[1] as number | undefined) ?? 0,
    liquidityFloor: (t[2] as bigint | undefined) ?? BigInt(0),
    maxSlippageBps: (t[3] as number | undefined) ?? 0,
    safeAsset: (t[4] as Address | undefined) ?? ZERO,
    bridgeVenue: (t[5] as Address | undefined) ?? ZERO,
    maxBridgeLTVBps: (t[6] as number | undefined) ?? 0,
    allowedActions: (t[7] as number | undefined) ?? 0,
    isLoading,
    isError,
  };
}
