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
      const outMin = minSafeOut(s.assetBalance, p);
      const borrow = maxBorrow(s.assetBalance, p);

      // Full-exit only: partial fills are not modeled — if depth can't absorb the
      // whole balance we fall through to bridge/protect-failed rather than dump a
      // partial amount into a thin pool. outMin > 0 rejects dust too small to size.
      const canExit =
        s.assetBalance > 0n &&
        isActionAllowed(p, ActionType.SWAP_TO_SAFE) &&
        s.liquidityDepth >= s.assetBalance &&
        outMin > 0n;
      if (canExit) {
        return {
          regime,
          plan: { action: ActionType.SWAP_TO_SAFE, amountIn: s.assetBalance, amountOutMin: outMin },
          reasonCode: regime === Regime.TERMINAL_DEPEG ? "terminal-exit" : "early-exit",
        };
      }

      // Transient (EARLY) depeg too illiquid to exit: bridge instead, if it sizes to a real borrow.
      if (regime === Regime.EARLY_DEPEG && s.assetBalance > 0n && isActionAllowed(p, ActionType.BRIDGE_VIA_LENDING) && borrow > 0n) {
        return {
          regime,
          plan: { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: s.assetBalance, borrowAmount: borrow },
          reasonCode: "liquidity-bridge",
        };
      }

      // Couldn't protect. Distinguish "amounts too small to act on" from genuine illiquidity.
      const dust = s.assetBalance > 0n && outMin === 0n;
      return { regime, plan: { action: ActionType.NONE }, reasonCode: dust ? "protect-failed-dust" : "protect-failed-illiquid" };
    }

    default: {
      const _exhaustive: never = regime;
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "unknown" };
    }
  }
}
