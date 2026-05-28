import { assessRegime } from "../engine/assessRegime";
import { selectAction } from "../engine/selectAction";
import { ActionType, Regime, divergenceBps, type AgentPolicy, type Decision, type Signals } from "../types";
import type { Portfolio, ScenarioTick, Strategy } from "./types";

function signalsFrom(tick: ScenarioTick, portfolio: Portfolio): Signals {
  return { ...tick, assetBalance: portfolio.assetBalance };
}

/**
 * The real Solvent brain plus the bridge lifecycle. `selectAction` (Plan 2) never emits
 * UNWIND_BRIDGE because it has no bridged-position signal; here the sim knows the portfolio,
 * so the AI unwinds on re-peg. Integration wires a bridged-position source into the engine.
 */
export const aiStrategy: Strategy = {
  name: "solvent-ai",
  decide(tick, portfolio, policy): Decision {
    const signals = signalsFrom(tick, portfolio);
    const regime = assessRegime(signals, policy);

    // Unwind on a return to CALM/WATCH (re-peg). In this benchmark oracleDivergenceBps is
    // always 0, so WATCH only signals a small price divergence, never feed mistrust.
    if (portfolio.bridged && (regime === Regime.CALM || regime === Regime.WATCH)) {
      return {
        regime,
        plan: { action: ActionType.UNWIND_BRIDGE, repayAmount: portfolio.bridged.debt, withdrawAmount: portfolio.bridged.collateral },
        reasonCode: "unwind-repeg",
      };
    }
    if (portfolio.bridged) {
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "bridge-holding" };
    }
    if (portfolio.assetBalance === 0n) {
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "secured" };
    }
    return selectAction(regime, signals, policy);
  },
};

/** Passive HODL: never acts. */
export const hodlStrategy: Strategy = {
  name: "passive-hodl",
  decide(tick, portfolio, policy): Decision {
    const regime = assessRegime(signalsFrom(tick, portfolio), policy);
    return { regime, plan: { action: ActionType.NONE }, reasonCode: "hodl" };
  },
};

/**
 * Delayed human: ignores small wobbles, then panic-sells the whole position once the depeg
 * is undeniable — but only after a reaction latency, locking in the loss too late. Stateful;
 * create a fresh instance per scenario run.
 */
export function createDelayedHuman(opts: { panicDivergenceBps: number; latencyTicks: number }): Strategy {
  let ticksOverPanic = 0;
  let sold = false;
  return {
    name: "delayed-human",
    decide(tick, portfolio, policy): Decision {
      const signals = signalsFrom(tick, portfolio);
      const regime = assessRegime(signals, policy);

      if (sold || portfolio.assetBalance === 0n) {
        return { regime, plan: { action: ActionType.NONE }, reasonCode: "sold-out" };
      }
      if (divergenceBps(signals) >= opts.panicDivergenceBps) {
        ticksOverPanic += 1;
      }
      if (ticksOverPanic >= opts.latencyTicks) {
        sold = true;
        return {
          regime,
          plan: { action: ActionType.SWAP_TO_SAFE, amountIn: portfolio.assetBalance, amountOutMin: 0n },
          reasonCode: "panic-sell",
        };
      }
      return { regime, plan: { action: ActionType.NONE }, reasonCode: "hold-and-hope" };
    },
  };
}
