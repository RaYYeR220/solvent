import { encodeAbiParameters } from "viem";
import { ActionType, type ActionPlan, type Address } from "../types";

/** Encodes an ActionPlan's params to match the SolventVault handler `abi.decode` shapes. */
export function encodeActionParams(plan: ActionPlan, ctx: { asset: Address; safeAsset: Address }): `0x${string}` {
  switch (plan.action) {
    case ActionType.SWAP_TO_SAFE:
      return encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }],
        [plan.amountIn, plan.amountOutMin, [ctx.asset, ctx.safeAsset]],
      );
    case ActionType.BRIDGE_VIA_LENDING:
      return encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [plan.collateralAmount, plan.borrowAmount]);
    case ActionType.UNWIND_BRIDGE:
      return encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [plan.repayAmount, plan.withdrawAmount]);
    case ActionType.PARK_YIELD:
      return encodeAbiParameters([{ type: "uint256" }], [plan.amount]);
    case ActionType.NONE:
      return "0x";
  }
}
