"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, vaultAbi } from "../contracts";
import type { Abi, Address } from "viem";

/**
 * Vault operating mode, derived live from on-chain state.
 *
 * - DIRECT  — the vault holds its risk/safe assets itself (no open hedge).
 * - BRIDGED — the agent has bridged into the policy's lending venue (INIT):
 *             USDY posted as collateral, USDC borrowed out. `collateral` and
 *             `debt` surface the open position so a viewer understands the hedge.
 */
export interface VaultModeLive {
  mode: "DIRECT" | "BRIDGED";
  /** Bridged collateral in the risk asset's units (USDY, 18 dec). */
  collateral: bigint;
  /** Bridged debt in the safe asset's units (USDC, 6 dec). */
  debt: bigint;
  isLoading: boolean;
  isError: boolean;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";

// Minimal ABI fragment for the InitLendingAdapterV2 position views the vault's
// `policy.bridgeVenue` exposes. Inlined here so contracts.ts stays untouched.
const lendingVenueViewsAbi = [
  {
    type: "function",
    name: "collateralUnderlying",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "debtUnderlying",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;

export function useVaultMode(): VaultModeLive {
  // Policy struct field order (see SolventVaultV2):
  //   0 earlyDivergenceBps, 1 terminalDivergenceBps, 2 liquidityFloor,
  //   3 maxSlippageBps, 4 safeAsset, 5 bridgeVenue, 6 maxBridgeLTVBps, 7 allowedActions
  const policyRead = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "policy",
    query: { refetchInterval: 12_000 },
  });

  const tuple = (policyRead.data ?? []) as readonly unknown[];
  const bridgeVenue = (tuple[5] as Address | undefined) ?? ZERO;
  const hasVenue = bridgeVenue !== ZERO;

  // Only read the venue views when a bridge venue is configured.
  const venueReads = useReadContracts({
    contracts: [
      { address: bridgeVenue, abi: lendingVenueViewsAbi, functionName: "collateralUnderlying" },
      { address: bridgeVenue, abi: lendingVenueViewsAbi, functionName: "debtUnderlying" },
    ],
    query: { enabled: hasVenue, refetchInterval: 12_000 },
  });

  const collateral = (venueReads.data?.[0]?.result as bigint | undefined) ?? BigInt(0);
  const debt = (venueReads.data?.[1]?.result as bigint | undefined) ?? BigInt(0);

  // BRIDGED only when a venue is wired AND it actually holds collateral.
  const mode: "DIRECT" | "BRIDGED" = hasVenue && collateral > BigInt(0) ? "BRIDGED" : "DIRECT";

  return {
    mode,
    collateral: mode === "BRIDGED" ? collateral : BigInt(0),
    debt: mode === "BRIDGED" ? debt : BigInt(0),
    isLoading: policyRead.isLoading || (hasVenue && venueReads.isLoading),
    isError: policyRead.isError || (hasVenue && venueReads.isError),
  };
}
