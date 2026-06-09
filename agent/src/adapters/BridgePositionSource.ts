import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { BridgeSource } from "./types";

const ZERO: Address = "0x0000000000000000000000000000000000000000";

/** Reads the vault's on-chain `policy.bridgeVenue`. Mirrors the public getter
 *  generated for the `Policy` struct (fields in declaration order). */
const vaultPolicyAbi = [
  {
    type: "function",
    name: "policy",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "earlyDivergenceBps", type: "uint16" },
      { name: "terminalDivergenceBps", type: "uint16" },
      { name: "liquidityFloor", type: "uint256" },
      { name: "maxSlippageBps", type: "uint16" },
      { name: "safeAsset", type: "address" },
      { name: "bridgeVenue", type: "address" },
      { name: "maxBridgeLTVBps", type: "uint16" },
      { name: "allowedActions", type: "uint32" },
    ],
  },
] as const;

/** The bridge venue's position-read views (InitLendingAdapterV2 / ILendingViews). */
const bridgeViewsAbi = [
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
] as const;

const balanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Reads the vault's open bridge (INIT lending) position via the venue views,
 *  plus the vault's own safe-asset balance (used to size the unwind repay so
 *  interest dust is always covered). Resolves the venue and safe asset from the
 *  vault's on-chain `policy` so the agent needs no extra config. Returns null
 *  when no venue is set or no position is open (collateral == 0), so the engine
 *  treats an unbridged vault exactly as before. */
export class BridgePositionSource implements BridgeSource {
  constructor(
    private readonly client: PublicClient,
    private readonly vault: Address,
  ) {}

  async getBridgedPosition(): Promise<{ collateral: bigint; debt: bigint; safeBalance: bigint } | null> {
    const policy = await this.client.readContract({
      address: this.vault,
      abi: vaultPolicyAbi,
      functionName: "policy",
    });
    // policy is a tuple in declaration order: safeAsset is index 4, bridgeVenue index 5.
    const safeAsset = policy[4] as Address;
    const bridgeVenue = policy[5] as Address;
    if (bridgeVenue === ZERO) return null;

    const [collateral, debt, safeBalance] = await Promise.all([
      this.client.readContract({ address: bridgeVenue, abi: bridgeViewsAbi, functionName: "collateralUnderlying" }),
      this.client.readContract({ address: bridgeVenue, abi: bridgeViewsAbi, functionName: "debtUnderlying" }),
      this.client.readContract({ address: safeAsset, abi: balanceOfAbi, functionName: "balanceOf", args: [this.vault] }),
    ]);
    if (collateral === 0n) return null;
    return { collateral, debt, safeBalance };
  }
}
