import type { AgentPolicy } from "../types";
import type { DecisionLogEntry, Portfolio, Scenario, ScenarioResult, Strategy } from "./types";
import { applyAction } from "./portfolio";
import { markToMarket } from "./value";

/** Step a scenario through one strategy, marking the portfolio to market each tick. */
export function runScenario(scenario: Scenario, strategy: Strategy, policy: AgentPolicy): ScenarioResult {
  const { assetDecimals, safeDecimals } = scenario;
  if (scenario.ticks.length === 0) throw new Error("scenario has no ticks");
  const firstTick = scenario.ticks[0]!;

  let portfolio: Portfolio = { assetBalance: scenario.initialAssetBalance, safeBalance: 0n, bridged: null };
  const initialValue = markToMarket(portfolio, firstTick, assetDecimals, safeDecimals);
  const log: DecisionLogEntry[] = [];
  let lastTick = firstTick;

  for (const tick of scenario.ticks) {
    const decision = strategy.decide(tick, portfolio, policy);
    portfolio = applyAction(portfolio, decision.plan, tick, assetDecimals, safeDecimals);
    log.push({
      timestamp: tick.timestamp,
      regime: decision.regime,
      action: decision.plan.action,
      reasonCode: decision.reasonCode,
      valueAfter: markToMarket(portfolio, tick, assetDecimals, safeDecimals),
    });
    lastTick = tick;
  }

  const finalValue = markToMarket(portfolio, lastTick, assetDecimals, safeDecimals);
  const pctPreservedBps = initialValue === 0n ? 0 : Number((finalValue * 10000n) / initialValue);
  return { scenarioName: scenario.name, strategyName: strategy.name, initialValue, finalValue, pctPreservedBps, log };
}
