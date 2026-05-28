import { ActionType, type ActionPlan } from "../types";
import type { Portfolio, ScenarioTick } from "./types";
import { assetToSafe } from "./value";

/** Apply an executed action plan to a portfolio, returning the new portfolio. Pure. */
export function applyAction(
  p: Portfolio,
  plan: ActionPlan,
  tick: ScenarioTick,
  assetDecimals: number,
  safeDecimals: number,
): Portfolio {
  switch (plan.action) {
    case ActionType.NONE:
      return p;
    case ActionType.PARK_YIELD:
      // Parking keeps full asset exposure; yield is out of scope for a depeg benchmark.
      return p;
    case ActionType.SWAP_TO_SAFE: {
      const out = assetToSafe(plan.amountIn, tick.marketPrice, assetDecimals, safeDecimals);
      return { ...p, assetBalance: p.assetBalance - plan.amountIn, safeBalance: p.safeBalance + out };
    }
    case ActionType.BRIDGE_VIA_LENDING:
      return {
        assetBalance: p.assetBalance - plan.collateralAmount,
        safeBalance: p.safeBalance + plan.borrowAmount,
        bridged: { collateral: plan.collateralAmount, debt: plan.borrowAmount },
      };
    case ActionType.UNWIND_BRIDGE:
      return {
        assetBalance: p.assetBalance + plan.withdrawAmount,
        safeBalance: p.safeBalance - plan.repayAmount,
        bridged: null,
      };
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}
