import { ActionType, Regime, isActionAllowed, type AgentPolicy, type Decision, type Signals } from "../types";

/** Minimum safe-asset output for a full early exit, mirroring the on-chain slippage floor. */
export function minSafeOut(amountIn: bigint, p: AgentPolicy): bigint {
  return (amountIn * BigInt(10000 - p.maxSlippageBps) * 10n ** BigInt(p.safeDecimals)) /
    (10000n * 10n ** BigInt(p.assetDecimals));
}

/** Maximum safe-asset borrow against collateral, mirroring the on-chain LTV cap. */
export function maxBorrow(collateral: bigint, p: AgentPolicy): bigint {
  return (collateral * BigInt(p.maxBridgeLTVBps) * 10n ** BigInt(p.safeDecimals)) /
    (10000n * 10n ** BigInt(p.assetDecimals));
}

/**
 * Chooses a policy-bounded action for the regime.
 * - CALM: park idle capital in safe yield.
 * - WATCH: observe only.
 * - EARLY/TERMINAL: exit into available liquidity if possible (the timing edge);
 *   for a transient (EARLY) depeg that's too illiquid to exit, bridge instead;
 *   if neither is possible, do nothing and report protect-failed (never dump into an empty pool).
 */
export function selectAction(regime: Regime, s: Signals, p: AgentPolicy): Decision {
  switch (regime) {
    case Regime.CALM:
      if (s.assetBalance > 0n && isActionAllowed(p, ActionType.PARK_YIELD)) {
        return { regime, plan: { action: ActionType.PARK_YIELD, amount: s.assetBalance }, reasonCode: "park-calm" };
      }
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "calm-idle" };

    case Regime.WATCH:
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "watch" };

    case Regime.EARLY_DEPEG:
    case Regime.TERMINAL_DEPEG: {
      const canExit =
        s.assetBalance > 0n &&
        isActionAllowed(p, ActionType.SWAP_TO_SAFE) &&
        s.liquidityDepth >= s.assetBalance;
      if (canExit) {
        return {
          regime,
          plan: { action: ActionType.SWAP_TO_SAFE, amountIn: s.assetBalance, amountOutMin: minSafeOut(s.assetBalance, p) },
          reasonCode: regime === Regime.TERMINAL_DEPEG ? "terminal-exit" : "early-exit",
        };
      }
      if (regime === Regime.EARLY_DEPEG && s.assetBalance > 0n && isActionAllowed(p, ActionType.BRIDGE_VIA_LENDING)) {
        return {
          regime,
          plan: { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: s.assetBalance, borrowAmount: maxBorrow(s.assetBalance, p) },
          reasonCode: "liquidity-bridge",
        };
      }
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "protect-failed-illiquid" };
    }

    default:
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "unknown" };
  }
}
