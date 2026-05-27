import { Regime, divergenceBps, type AgentPolicy, type Signals } from "../types";

/**
 * Classifies the current regime purely from divergence thresholds.
 * Untrusted data (oracle spread above the policy max) is never allowed to
 * escalate beyond WATCH — the agent does not act on a single suspicious feed.
 */
export function assessRegime(s: Signals, p: AgentPolicy): Regime {
  if (s.oracleDivergenceBps > p.maxOracleDivergenceBps) return Regime.WATCH;

  const div = divergenceBps(s);
  if (div >= p.terminalDivergenceBps) return Regime.TERMINAL_DEPEG;
  if (div >= p.earlyDivergenceBps) return Regime.EARLY_DEPEG;
  if (div >= p.watchDivergenceBps) return Regime.WATCH;
  return Regime.CALM;
}
