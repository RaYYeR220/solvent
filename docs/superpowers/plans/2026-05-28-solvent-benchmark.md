# Solvent Human-vs-AI Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, in-memory economic simulation that runs the real Solvent decision engine against scripted "human" strategies over canonical depeg trajectories, producing the Human-vs-AI scoreboard (% capital preserved + decision log) that is the demo centerpiece.

**Architecture:** A new `agent/src/benchmark/` module. Each tick of a *scenario* (a depeg price trajectory) feeds a *strategy* (AI = real `assessRegime`/`selectAction` + bridge lifecycle; passive-HODL; delayed-human) which returns a `Decision`; a pure *portfolio model* applies the action's economics (swap/bridge/unwind/park) to that strategy's holdings; the run is marked-to-market each tick. `runBenchmark` runs all three strategies over both scenarios and emits a `BenchmarkReport` the dashboard (Plan 4) consumes. No chain access — the on-chain fork replay with real ERC-8004 attestations is the integration phase, reusing these same scenarios.

**Tech Stack:** TypeScript (ESM, strict, `noUncheckedIndexedAccess`), vitest, `tsx` for the CLI. Reuses existing `agent/src/types.ts` and `agent/src/engine/*`. No new dependencies.

---

## File Structure

All new files live under the existing `agent/` package (tracked by the repo-root git; tests auto-discovered by `vitest.config.ts` via `test/**/*.test.ts`).

- `agent/src/benchmark/types.ts` — `Scenario`, `ScenarioTick`, `Portfolio`, `DecisionLogEntry`, `ScenarioResult`, `BenchmarkReport`, `Strategy`. Pure types only.
- `agent/src/benchmark/value.ts` — `assetToSafe` (price conversion) + `markToMarket` (portfolio valuation). Pure math.
- `agent/src/benchmark/portfolio.ts` — `applyAction`: applies one `ActionPlan`'s economics to a `Portfolio`. Pure.
- `agent/src/benchmark/strategies.ts` — `aiStrategy`, `hodlStrategy`, `createDelayedHuman`. The decision layer.
- `agent/src/benchmark/scenarios.ts` — `benchmarkPolicy`, `transientScenario`, `terminalScenario` fixtures.
- `agent/src/benchmark/run.ts` — `runScenario`: step a scenario through one strategy → `ScenarioResult`.
- `agent/src/benchmark/benchmark.ts` — `runBenchmark`: all strategies × both scenarios → `BenchmarkReport`.
- `agent/src/benchmark/index.ts` — `toScoreboardJson` (bigint-safe serialization) + `main` CLI that writes `benchmark-report.json`.
- Tests mirror under `agent/test/benchmark/`.

**Reused, do NOT modify:** `agent/src/types.ts` (`ActionType`, `Regime`, `Signals`, `AgentPolicy`, `ActionPlan`, `Decision`, `isActionAllowed`, `divergenceBps`), `agent/src/engine/assessRegime.ts`, `agent/src/engine/selectAction.ts` (`selectAction`, `minSafeOut`, `maxBorrow`).

## Design notes & deliberate simplifications

- **Units.** Asset = 18 decimals (USDY), safe = 6 decimals (USDC/USDT0). All portfolio values are reported in safe-asset native units (a clean "dollar" number).
- **NAV is constant at par** in both scenarios; only market price diverges. `divergenceBps = (nav − market)/nav`. This matches the on-chain divergence math and keeps fixtures readable.
- **Action sizing is never re-derived here.** `selectAction` already computes `amountOutMin`/`borrowAmount` to mirror the on-chain floor/LTV. The portfolio model *consumes* those amounts — sizing stays in one place (the agent⇄contract alignment from Plan 2 is preserved).
- **UNWIND_BRIDGE lives at the strategy layer (sim only).** Plan 2's `selectAction` never emits `UNWIND_BRIDGE` (it lacks a bridged-position signal). `aiStrategy` knows the portfolio in the sim, so it unwinds on re-peg. Integration wires a real bridged-position signal source into the engine; the behavior modeled here is the contract for that work.
- **Swaps realize at clean market price** for every strategy (no extra thin-pool slippage penalty). The human loses on *timing* (selling at the bottom price), not on a slippage model — the cleanest honest comparison. Real slippage is enforced on-chain via `minOut` and is out of scope for this benchmark.
- **Park earns no yield in the model.** `PARK_YIELD` keeps full asset exposure (a no-op economically). Yield is irrelevant to a depeg-preservation comparison; modeling it would only add noise.
- **No forced liquidation** in the modeled scenarios (50% LTV vs a transient bottom of $0.915 keeps bridge equity positive). The on-chain `maxBridgeLTV` guardrail and the terminal stop-loss path are covered by Plan 1's contract tests.

---

### Task 1: Benchmark types + valuation math

**Files:**
- Create: `agent/src/benchmark/types.ts`
- Create: `agent/src/benchmark/value.ts`
- Test: `agent/test/benchmark/value.test.ts`

- [ ] **Step 1: Write the types file**

Create `agent/src/benchmark/types.ts`:

```ts
import type { ActionType, Regime, Signals, AgentPolicy, Decision } from "../types";

/** One step of a depeg trajectory. The portfolio supplies assetBalance, so it is omitted here. */
export type ScenarioTick = Omit<Signals, "assetBalance">;

/** A depeg trajectory plus the capital and decimals the run starts with. */
export interface Scenario {
  name: string;
  description: string;
  assetDecimals: number;
  safeDecimals: number;
  initialAssetBalance: bigint; // asset-native units
  ticks: ScenarioTick[];
}

/** A vault's holdings during a simulation, all in token-native units. */
export interface Portfolio {
  assetBalance: bigint; // free at-risk asset
  safeBalance: bigint; // safe-asset holdings
  bridged: { collateral: bigint; debt: bigint } | null; // open lending bridge, if any
}

export interface DecisionLogEntry {
  timestamp: number;
  regime: Regime;
  action: ActionType;
  reasonCode: string;
  valueAfter: bigint; // mark-to-market in safe-asset units after applying the action
}

export interface ScenarioResult {
  scenarioName: string;
  strategyName: string;
  initialValue: bigint; // safe-asset units, marked at the first tick
  finalValue: bigint; // safe-asset units, marked at the last tick
  pctPreservedBps: number; // finalValue / initialValue, in bps (10000 = 100%)
  log: DecisionLogEntry[];
}

export interface BenchmarkReport {
  scenarios: Array<{ name: string; description: string; results: ScenarioResult[] }>;
}

/** A decision-maker: given current market + its own portfolio, choose a policy-bounded action. */
export interface Strategy {
  name: string;
  decide(tick: ScenarioTick, portfolio: Portfolio, policy: AgentPolicy): Decision;
}
```

- [ ] **Step 2: Write the failing valuation test**

Create `agent/test/benchmark/value.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assetToSafe, markToMarket } from "../../src/benchmark/value";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n; // milli = price * 1000

function tick(over: Partial<ScenarioTick> = {}): ScenarioTick {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0, ...over };
}

describe("assetToSafe", () => {
  it("converts asset-native (18dec) to safe-native (6dec) at a given 1e18 price", () => {
    expect(assetToSafe(1000n * ONE, ONE, 18, 6)).toBe(1000n * 10n ** 6n); // $1.00
    expect(assetToSafe(1000n * ONE, price(985), 18, 6)).toBe(985n * 10n ** 6n); // $0.985
  });
});

describe("markToMarket", () => {
  it("values free asset at market price", () => {
    const p: Portfolio = { assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null };
    expect(markToMarket(p, tick(), 18, 6)).toBe(1000n * 10n ** 6n);
  });
  it("counts safe holdings at face value regardless of price", () => {
    const p: Portfolio = { assetBalance: 0n, safeBalance: 915n * 10n ** 6n, bridged: null };
    expect(markToMarket(p, tick({ marketPrice: price(100) }), 18, 6)).toBe(915n * 10n ** 6n);
  });
  it("nets bridge equity = collateral value − debt", () => {
    const p: Portfolio = { assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } };
    // at $0.915: safe 500 + (915 − 500) = 915
    expect(markToMarket(p, tick({ marketPrice: price(915) }), 18, 6)).toBe(915n * 10n ** 6n);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/value.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/value` (module not found).

- [ ] **Step 4: Write the valuation implementation**

Create `agent/src/benchmark/value.ts`:

```ts
import type { Portfolio, ScenarioTick } from "./types";

/** Value of an asset amount expressed in safe-asset native units at a given 1e18 price. */
export function assetToSafe(assetAmount: bigint, price: bigint, assetDecimals: number, safeDecimals: number): bigint {
  return (assetAmount * price * 10n ** BigInt(safeDecimals)) / (10n ** 18n * 10n ** BigInt(assetDecimals));
}

/** Total portfolio value in safe-asset units, marked at the tick's market price. */
export function markToMarket(p: Portfolio, tick: ScenarioTick, assetDecimals: number, safeDecimals: number): bigint {
  const free = assetToSafe(p.assetBalance, tick.marketPrice, assetDecimals, safeDecimals);
  const bridgeEquity = p.bridged
    ? assetToSafe(p.bridged.collateral, tick.marketPrice, assetDecimals, safeDecimals) - p.bridged.debt
    : 0n;
  return p.safeBalance + free + bridgeEquity;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/value.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/types.ts agent/src/benchmark/value.ts agent/test/benchmark/value.test.ts
git commit -m "feat(bench): scenario/portfolio types and valuation math"
```

---

### Task 2: Portfolio action model

**Files:**
- Create: `agent/src/benchmark/portfolio.ts`
- Test: `agent/test/benchmark/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Create `agent/test/benchmark/portfolio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyAction } from "../../src/benchmark/portfolio";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";
import { ActionType } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const tick = (milli: number): ScenarioTick => ({ navPrice: ONE, marketPrice: price(milli), liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0 });
const held = (): Portfolio => ({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });

describe("applyAction", () => {
  it("NONE leaves the portfolio unchanged", () => {
    expect(applyAction(held(), { action: ActionType.NONE }, tick(1000), 18, 6)).toEqual(held());
  });

  it("PARK_YIELD keeps full asset exposure (no economic change)", () => {
    expect(applyAction(held(), { action: ActionType.PARK_YIELD, amount: 1000n * ONE }, tick(1000), 18, 6)).toEqual(held());
  });

  it("SWAP_TO_SAFE converts asset to safe at the tick's market price", () => {
    const out = applyAction(held(), { action: ActionType.SWAP_TO_SAFE, amountIn: 1000n * ONE, amountOutMin: 0n }, tick(985), 18, 6);
    expect(out).toEqual({ assetBalance: 0n, safeBalance: 985n * 10n ** 6n, bridged: null });
  });

  it("BRIDGE_VIA_LENDING moves asset to collateral and credits borrowed safe", () => {
    const out = applyAction(held(), { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 1000n * ONE, borrowAmount: 500n * 10n ** 6n }, tick(915), 18, 6);
    expect(out).toEqual({ assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } });
  });

  it("UNWIND_BRIDGE repays debt and returns collateral to the asset balance", () => {
    const bridged: Portfolio = { assetBalance: 0n, safeBalance: 500n * 10n ** 6n, bridged: { collateral: 1000n * ONE, debt: 500n * 10n ** 6n } };
    const out = applyAction(bridged, { action: ActionType.UNWIND_BRIDGE, repayAmount: 500n * 10n ** 6n, withdrawAmount: 1000n * ONE }, tick(1000), 18, 6);
    expect(out).toEqual({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/portfolio.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/portfolio`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/portfolio.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/portfolio.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/portfolio.ts agent/test/benchmark/portfolio.test.ts
git commit -m "feat(bench): portfolio action model (swap/bridge/unwind/park)"
```

---

### Task 3: Strategies (AI, passive HODL, delayed human)

**Files:**
- Create: `agent/src/benchmark/strategies.ts`
- Test: `agent/test/benchmark/strategies.test.ts`

- [ ] **Step 1: Write the failing test**

Create `agent/test/benchmark/strategies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aiStrategy, hodlStrategy, createDelayedHuman } from "../../src/benchmark/strategies";
import type { Portfolio, ScenarioTick } from "../../src/benchmark/types";
import { ActionType, Regime, type AgentPolicy } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const SAFE = 10n ** 6n;

function policy(): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6,
    allowedActions:
      (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
      (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD),
  };
}
function tick(over: Partial<ScenarioTick> = {}): ScenarioTick {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, oracleDivergenceBps: 0, timestamp: 0, ...over };
}
const held = (): Portfolio => ({ assetBalance: 1000n * ONE, safeBalance: 0n, bridged: null });
const bridgedP = (): Portfolio => ({ assetBalance: 0n, safeBalance: 500n * SAFE, bridged: { collateral: 1000n * ONE, debt: 500n * SAFE } });

describe("aiStrategy", () => {
  it("CALM -> parks idle capital", () => {
    const d = aiStrategy.decide(tick({ marketPrice: ONE }), held(), policy());
    expect(d.plan.action).toBe(ActionType.PARK_YIELD);
  });
  it("EARLY + deep liquidity -> early exit", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(985), liquidityDepth: 10n ** 30n }), held(), policy());
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("early-exit");
  });
  it("EARLY + thin liquidity -> liquidity bridge", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(985), liquidityDepth: 1n }), held(), policy());
    expect(d.plan.action).toBe(ActionType.BRIDGE_VIA_LENDING);
    expect(d.reasonCode).toBe("liquidity-bridge");
  });
  it("bridged + re-peg (CALM) -> unwind", () => {
    const d = aiStrategy.decide(tick({ marketPrice: ONE }), bridgedP(), policy());
    expect(d.plan.action).toBe(ActionType.UNWIND_BRIDGE);
    expect(d.reasonCode).toBe("unwind-repeg");
    if (d.plan.action === ActionType.UNWIND_BRIDGE) {
      expect(d.plan.repayAmount).toBe(500n * SAFE);
      expect(d.plan.withdrawAmount).toBe(1000n * ONE);
    }
  });
  it("bridged + still depegged -> hold", () => {
    const d = aiStrategy.decide(tick({ marketPrice: price(915), liquidityDepth: 1n }), bridgedP(), policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("bridge-holding");
  });
  it("no asset and no bridge -> secured (nothing left to protect)", () => {
    const secured: Portfolio = { assetBalance: 0n, safeBalance: 985n * SAFE, bridged: null };
    const d = aiStrategy.decide(tick({ marketPrice: price(500) }), secured, policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("secured");
  });
});

describe("hodlStrategy", () => {
  it("never acts, whatever the regime", () => {
    const d = hodlStrategy.decide(tick({ marketPrice: price(100) }), held(), policy());
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("hodl");
  });
});

describe("createDelayedHuman", () => {
  it("holds below the panic threshold", () => {
    const human = createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 });
    const d = human.decide(tick({ marketPrice: price(985) }), held(), policy()); // 150 bps < 500
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("hold-and-hope");
  });
  it("panic-sells everything only after the reaction latency, then stays out", () => {
    const human = createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 });
    let p = held();
    // tick over panic #1 -> still holds
    expect(human.decide(tick({ marketPrice: price(900) }), p, policy()).plan.action).toBe(ActionType.NONE); // 1000 bps, count 1
    // tick over panic #2 -> dumps all asset at the current price, ignoring slippage
    const sell = human.decide(tick({ marketPrice: price(780) }), p, policy()); // 2200 bps, count 2
    expect(sell.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(sell.reasonCode).toBe("panic-sell");
    if (sell.plan.action === ActionType.SWAP_TO_SAFE) {
      expect(sell.plan.amountIn).toBe(1000n * ONE);
      expect(sell.plan.amountOutMin).toBe(0n);
    }
    // once sold out (no asset), it does nothing further
    p = { assetBalance: 0n, safeBalance: 780n * SAFE, bridged: null };
    const after = human.decide(tick({ marketPrice: price(340) }), p, policy());
    expect(after.plan.action).toBe(ActionType.NONE);
    expect(after.reasonCode).toBe("sold-out");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/strategies.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/strategies`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/strategies.ts`:

```ts
import { assessRegime } from "../engine/assessRegime";
import { selectAction } from "../engine/selectAction";
import { ActionType, Regime, divergenceBps, type Decision } from "../types";
import type { Portfolio, ScenarioTick, Strategy } from "./types";
import type { AgentPolicy, Signals } from "../types";

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/strategies.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/strategies.ts agent/test/benchmark/strategies.test.ts
git commit -m "feat(bench): AI, passive-HODL, and delayed-human strategies"
```

---

### Task 4: Scenario fixtures + benchmark policy

**Files:**
- Create: `agent/src/benchmark/scenarios.ts`
- Test: `agent/test/benchmark/scenarios.test.ts`

- [ ] **Step 1: Write the failing test**

Create `agent/test/benchmark/scenarios.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { benchmarkPolicy, transientScenario, terminalScenario } from "../../src/benchmark/scenarios";
import { divergenceBps } from "../../src/types";

const ONE = 10n ** 18n;

describe("benchmarkPolicy", () => {
  it("uses the balanced thresholds the scenarios are tuned against", () => {
    const p = benchmarkPolicy();
    expect(p.earlyDivergenceBps).toBe(50);
    expect(p.terminalDivergenceBps).toBe(1000);
    expect(p.maxBridgeLTVBps).toBe(5000);
    expect(p.assetDecimals).toBe(18);
    expect(p.safeDecimals).toBe(6);
  });
});

describe("transientScenario", () => {
  it("holds NAV at par and fully recovers in market price", () => {
    expect(transientScenario.ticks.every((t) => t.navPrice === ONE)).toBe(true);
    expect(transientScenario.ticks[0]!.marketPrice).toBe(ONE);
    expect(transientScenario.ticks.at(-1)!.marketPrice).toBe(ONE);
  });
  it("never crosses the terminal threshold (stays in early-depeg territory)", () => {
    const maxDiv = Math.max(...transientScenario.ticks.map((t) => divergenceBps({ ...t, assetBalance: 0n })));
    expect(maxDiv).toBeGreaterThanOrEqual(benchmarkPolicy().earlyDivergenceBps);
    expect(maxDiv).toBeLessThan(benchmarkPolicy().terminalDivergenceBps);
  });
  it("has thin liquidity so exit is infeasible and the bridge is forced", () => {
    expect(transientScenario.ticks.every((t) => t.liquidityDepth < transientScenario.initialAssetBalance)).toBe(true);
  });
});

describe("terminalScenario", () => {
  it("collapses and never recovers", () => {
    expect(terminalScenario.ticks[0]!.marketPrice).toBe(ONE);
    expect(terminalScenario.ticks.at(-1)!.marketPrice).toBeLessThan(ONE / 5n); // below $0.20
  });
  it("has deep liquidity early so an early exit is possible before it dries", () => {
    expect(terminalScenario.ticks[1]!.liquidityDepth).toBeGreaterThanOrEqual(terminalScenario.initialAssetBalance);
    expect(terminalScenario.ticks.at(-1)!.liquidityDepth).toBeLessThan(terminalScenario.initialAssetBalance);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/scenarios.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/scenarios`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/scenarios.ts`:

```ts
import { ActionType, type AgentPolicy } from "../types";
import type { Scenario } from "./types";

const ONE = 10n ** 18n;
/** milli = price * 1000, so price(985) = $0.985 as a 1e18 fixed-point value. */
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const INITIAL = 1000n * ONE; // 1000 units of an 18-decimal asset
const THIN = 1n; // RWA reality: too little depth to exit -> forces the bridge
const DEEP = 10n ** 30n; // ample depth -> early exit is feasible

const ALL_ACTIONS =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

/** Balanced preset the canonical scenarios are tuned against. */
export function benchmarkPolicy(): AgentPolicy {
  return {
    watchDivergenceBps: 25,
    earlyDivergenceBps: 50,
    terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500,
    liquidityFloor: 0n,
    maxSlippageBps: 300,
    maxBridgeLTVBps: 5000,
    assetDecimals: 18,
    safeDecimals: 6,
    allowedActions: ALL_ACTIONS,
  };
}

/** USDC March-2023 shape: par -> ~$0.915 -> full recovery, on a thin pool. The bridge is the hero. */
export const transientScenario: Scenario = {
  name: "transient-depeg",
  description: "USDC March 2023 shape: dip to ~$0.915 then full recovery; thin liquidity forces the bridge.",
  assetDecimals: 18,
  safeDecimals: 6,
  initialAssetBalance: INITIAL,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(985), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 3600 },
    { navPrice: ONE, marketPrice: price(960), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 7200 },
    { navPrice: ONE, marketPrice: price(930), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 10800 },
    { navPrice: ONE, marketPrice: price(915), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 14400 },
    { navPrice: ONE, marketPrice: price(930), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 18000 },
    { navPrice: ONE, marketPrice: price(965), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 21600 },
    { navPrice: ONE, marketPrice: price(990), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 25200 },
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 28800 },
  ],
};

/** UST shape: progressive collapse to ~$0.10, no recovery; liquidity present early then dries. */
export const terminalScenario: Scenario = {
  name: "terminal-collapse",
  description: "UST shape: progressive collapse to ~$0.10, no recovery; liquidity present early then dries.",
  assetDecimals: 18,
  safeDecimals: 6,
  initialAssetBalance: INITIAL,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(985), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 3600 },
    { navPrice: ONE, marketPrice: price(955), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 7200 },
    { navPrice: ONE, marketPrice: price(900), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 10800 },
    { navPrice: ONE, marketPrice: price(780), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 14400 },
    { navPrice: ONE, marketPrice: price(560), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 18000 },
    { navPrice: ONE, marketPrice: price(340), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 21600 },
    { navPrice: ONE, marketPrice: price(180), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 25200 },
    { navPrice: ONE, marketPrice: price(100), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 28800 },
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/scenarios.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/scenarios.ts agent/test/benchmark/scenarios.test.ts
git commit -m "feat(bench): canonical transient + terminal scenario fixtures"
```

---

### Task 5: Scenario runner

**Files:**
- Create: `agent/src/benchmark/run.ts`
- Test: `agent/test/benchmark/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `agent/test/benchmark/run.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runScenario } from "../../src/benchmark/run";
import { hodlStrategy } from "../../src/benchmark/strategies";
import type { Scenario, Strategy } from "../../src/benchmark/types";
import { ActionType, Regime, type AgentPolicy } from "../../src/types";

const ONE = 10n ** 18n;
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const SAFE = 10n ** 6n;

function policy(): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: 0,
  };
}

// A 3-tick collapse: $1.00 -> $0.50 -> $0.20, deep liquidity throughout.
const collapse: Scenario = {
  name: "mini-collapse", description: "test fixture", assetDecimals: 18, safeDecimals: 6,
  initialAssetBalance: 1000n * ONE,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(500), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 1 },
    { navPrice: ONE, marketPrice: price(200), liquidityDepth: 10n ** 30n, oracleDivergenceBps: 0, timestamp: 2 },
  ],
};

describe("runScenario", () => {
  it("HODL rides the collapse all the way down", () => {
    const r = runScenario(collapse, hodlStrategy, policy());
    expect(r.scenarioName).toBe("mini-collapse");
    expect(r.strategyName).toBe("passive-hodl");
    expect(r.initialValue).toBe(1000n * SAFE); // $1000 at $1.00
    expect(r.finalValue).toBe(200n * SAFE); // $200 at $0.20
    expect(r.pctPreservedBps).toBe(2000); // 20%
    expect(r.log).toHaveLength(3);
  });

  it("a swap-at-first-tick strategy locks in par and ignores the collapse", () => {
    const exitNow: Strategy = {
      name: "exit-now",
      decide(_tick, p): { regime: Regime; plan: { action: ActionType.SWAP_TO_SAFE; amountIn: bigint; amountOutMin: bigint } | { action: ActionType.NONE }; reasonCode: string } {
        if (p.assetBalance > 0n) {
          return { regime: Regime.EARLY_DEPEG, plan: { action: ActionType.SWAP_TO_SAFE, amountIn: p.assetBalance, amountOutMin: 0n }, reasonCode: "exit" };
        }
        return { regime: Regime.CALM, plan: { action: ActionType.NONE }, reasonCode: "done" };
      },
    };
    const r = runScenario(collapse, exitNow, policy());
    expect(r.finalValue).toBe(1000n * SAFE); // sold all at $1.00 on tick 0
    expect(r.pctPreservedBps).toBe(10000);
    expect(r.log[0]!.action).toBe(ActionType.SWAP_TO_SAFE);
  });

  it("throws on an empty scenario", () => {
    const empty: Scenario = { ...collapse, ticks: [] };
    expect(() => runScenario(empty, hodlStrategy, policy())).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/run.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/run`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/run.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/run.ts agent/test/benchmark/run.test.ts
git commit -m "feat(bench): scenario runner with per-tick mark-to-market"
```

---

### Task 6: Benchmark orchestration + headline assertions

**Files:**
- Create: `agent/src/benchmark/benchmark.ts`
- Test: `agent/test/benchmark/benchmark.test.ts`

- [ ] **Step 1: Write the failing test**

This test encodes the demo's headline claims. Create `agent/test/benchmark/benchmark.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runBenchmark } from "../../src/benchmark/benchmark";
import { benchmarkPolicy } from "../../src/benchmark/scenarios";
import type { ScenarioResult } from "../../src/benchmark/types";

function pick(report: ReturnType<typeof runBenchmark>, scenario: string) {
  const sc = report.scenarios.find((s) => s.name === scenario);
  if (!sc) throw new Error(`missing scenario ${scenario}`);
  const by = (name: string): ScenarioResult => {
    const r = sc.results.find((x) => x.strategyName === name);
    if (!r) throw new Error(`missing strategy ${name}`);
    return r;
  };
  return { ai: by("solvent-ai"), hodl: by("passive-hodl"), human: by("delayed-human") };
}

describe("runBenchmark", () => {
  const report = runBenchmark(benchmarkPolicy());

  it("covers both canonical scenarios with all three strategies", () => {
    expect(report.scenarios.map((s) => s.name).sort()).toEqual(["terminal-collapse", "transient-depeg"]);
    for (const s of report.scenarios) {
      expect(s.results.map((r) => r.strategyName).sort()).toEqual(["delayed-human", "passive-hodl", "solvent-ai"]);
    }
  });

  it("terminal: AI early-exits near par; human reacts late; HODL is wiped out", () => {
    const { ai, hodl, human } = pick(report, "terminal-collapse");
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(9000); // ~98.5%
    expect(hodl.pctPreservedBps).toBeLessThanOrEqual(1500); // ~10%
    expect(ai.finalValue).toBeGreaterThan(human.finalValue);
    expect(human.finalValue).toBeGreaterThan(hodl.finalValue);
  });

  it("transient: AI matches the best-case HODL recovery while the human crystallizes the dip loss", () => {
    const { ai, hodl, human } = pick(report, "transient-depeg");
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(9900); // fully recovered
    expect(ai.pctPreservedBps).toBeGreaterThanOrEqual(hodl.pctPreservedBps - 50); // within 0.5% of HODL
    expect(ai.finalValue).toBeGreaterThan(human.finalValue); // human sold at the bottom
  });

  it("AI uses the bridge on the transient (thin pool) and an exit on the terminal (deep pool early)", () => {
    const tr = pick(report, "transient-depeg").ai;
    const te = pick(report, "terminal-collapse").ai;
    expect(tr.log.some((e) => e.reasonCode === "liquidity-bridge")).toBe(true);
    expect(tr.log.some((e) => e.reasonCode === "unwind-repeg")).toBe(true);
    expect(te.log.some((e) => e.reasonCode === "early-exit")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/benchmark.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/benchmark`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/benchmark.ts`:

```ts
import type { AgentPolicy } from "../types";
import type { BenchmarkReport, Scenario, Strategy } from "./types";
import { runScenario } from "./run";
import { aiStrategy, hodlStrategy, createDelayedHuman } from "./strategies";
import { transientScenario, terminalScenario } from "./scenarios";

/** Fresh strategy set per scenario (delayed-human is stateful, so it must not be shared). */
function strategiesFor(): Strategy[] {
  return [aiStrategy, hodlStrategy, createDelayedHuman({ panicDivergenceBps: 500, latencyTicks: 2 })];
}

/** Run every strategy over both canonical scenarios and assemble the scoreboard. */
export function runBenchmark(policy: AgentPolicy): BenchmarkReport {
  const scenarios: Scenario[] = [transientScenario, terminalScenario];
  return {
    scenarios: scenarios.map((sc) => ({
      name: sc.name,
      description: sc.description,
      results: strategiesFor().map((st) => runScenario(sc, st, policy)),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/benchmark.test.ts`
Expected: PASS (4 tests). If any headline assertion fails, the scenario fixtures (Task 4) or strategy logic (Task 3) diverged from the intended economics — fix there, do not loosen the assertions.

- [ ] **Step 5: Typecheck and commit**

Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/benchmark.ts agent/test/benchmark/benchmark.test.ts
git commit -m "feat(bench): benchmark orchestration with Human-vs-AI headline assertions"
```

---

### Task 7: CLI export of the scoreboard

**Files:**
- Create: `agent/src/benchmark/index.ts`
- Modify: `agent/package.json` (add `benchmark` script)
- Modify/Create: `agent/.gitignore` (ignore the generated report)
- Test: `agent/test/benchmark/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `agent/test/benchmark/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toScoreboardJson } from "../../src/benchmark/index";
import type { BenchmarkReport } from "../../src/benchmark/types";
import { ActionType, Regime } from "../../src/types";

const report: BenchmarkReport = {
  scenarios: [
    {
      name: "demo", description: "d",
      results: [
        {
          scenarioName: "demo", strategyName: "solvent-ai",
          initialValue: 1000n * 10n ** 6n, finalValue: 985n * 10n ** 6n, pctPreservedBps: 9850,
          log: [{ timestamp: 0, regime: Regime.EARLY_DEPEG, action: ActionType.SWAP_TO_SAFE, reasonCode: "early-exit", valueAfter: 985n * 10n ** 6n }],
        },
      ],
    },
  ],
};

describe("toScoreboardJson", () => {
  it("serializes bigints as decimal strings and stamps generatedAt", () => {
    const json = toScoreboardJson(report, 1700000000);
    const parsed = JSON.parse(json);
    expect(parsed.generatedAt).toBe(1700000000);
    expect(parsed.scenarios[0].results[0].finalValue).toBe("985000000");
    expect(parsed.scenarios[0].results[0].pctPreservedBps).toBe(9850);
    expect(parsed.scenarios[0].results[0].log[0].valueAfter).toBe("985000000");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `agent/`: `npm test -- test/benchmark/index.test.ts`
Expected: FAIL — cannot resolve `../../src/benchmark/index`.

- [ ] **Step 3: Write the implementation**

Create `agent/src/benchmark/index.ts`:

```ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BenchmarkReport } from "./types";
import { runBenchmark } from "./benchmark";
import { benchmarkPolicy } from "./scenarios";

/** JSON with bigints rendered as decimal strings, plus a generatedAt stamp. */
export function toScoreboardJson(report: BenchmarkReport, generatedAt: number): string {
  return JSON.stringify(
    { generatedAt, scenarios: report.scenarios },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

/** CLI: run the benchmark and write the scoreboard for the dashboard to read. */
export function main(): void {
  const report = runBenchmark(benchmarkPolicy());
  const json = toScoreboardJson(report, Math.floor(Date.now() / 1000));
  writeFileSync("benchmark-report.json", json);
  for (const sc of report.scenarios) {
    const summary = sc.results.map((r) => `${r.strategyName}=${(r.pctPreservedBps / 100).toFixed(1)}%`).join("  ");
    // eslint-disable-next-line no-console
    console.log(`${sc.name}: ${summary}`);
  }
}

// Run only when invoked directly (e.g. `tsx src/benchmark/index.ts`), not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Add the npm script**

In `agent/package.json`, add a `benchmark` entry to `scripts` (keep existing `test` and `typecheck`):

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "benchmark": "tsx src/benchmark/index.ts"
  },
```

- [ ] **Step 5: Ignore the generated report**

Append to `agent/.gitignore` (create the file if it does not exist) the line:

```
benchmark-report.json
```

- [ ] **Step 6: Run the test to verify it passes**

Run from `agent/`: `npm test -- test/benchmark/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Run the CLI end-to-end**

Run from `agent/`: `npm run benchmark`
Expected: prints two summary lines, e.g.
```
transient-depeg: solvent-ai=100.0%  passive-hodl=100.0%  delayed-human=91.5%
terminal-collapse: solvent-ai=98.5%  passive-hodl=10.0%  delayed-human=78.0%
```
and writes `agent/benchmark-report.json`.

- [ ] **Step 8: Run the full suite, typecheck, and commit**

Run from `agent/`: `npm test` → Expected: all suites pass (Plan 2's 43 + the new benchmark tests).
Run from `agent/`: `npm run typecheck` → Expected: no errors.

Run from repo root:
```bash
git add agent/src/benchmark/index.ts agent/package.json agent/.gitignore agent/test/benchmark/index.test.ts
git commit -m "feat(bench): CLI scoreboard export for the dashboard"
```

---

## Self-Review (completed during planning)

**Spec coverage (design §6, §7 ScenarioHarness/BaselineVault, §10 fork-integration, §13 build-order #7):**
- "Two vaults, equal start, same scenario" → `runScenario` starts every strategy from `initialAssetBalance`; `runBenchmark` runs all over identical scenarios. ✓
- "Passive HODL + delayed human behavior models" → `hodlStrategy`, `createDelayedHuman`. ✓
- "Narrative inversion: even a reasonable human loses" → terminal assertions (AI ≥ 90% vs human ~78% vs HODL ~10%); transient (AI ≈ HODL recovery vs human ~91.5%). ✓
- "Two canonical scenarios (transient USDC / terminal UST)" → `transientScenario`, `terminalScenario`. ✓
- "Output: final value per vault, % preserved, decision log" → `ScenarioResult` + `BenchmarkReport` + CLI JSON. ✓
- Liquidity-aware action selection (bridge on thin, exit on deep) → asserted in Task 6. ✓
- **Deferred (documented above, not gaps):** on-chain fork replay with real ERC-8004 attestations is the integration phase, reusing these scenarios; that is the "same bytecode / immutable transcript" verifiability layer.

**Placeholder scan:** No TBD/TODO; every code step is complete; every test has concrete expected values.

**Type consistency:** Reuses `ActionType`/`Regime`/`Signals`/`AgentPolicy`/`ActionPlan`/`Decision`/`divergenceBps` verbatim from `agent/src/types.ts`. `Strategy.decide` signature is identical across all three strategies and the runner. `Portfolio`/`ScenarioTick`/`ScenarioResult`/`BenchmarkReport` are defined once in `types.ts` and imported everywhere. `assetToSafe`/`markToMarket`/`applyAction`/`runScenario`/`runBenchmark`/`toScoreboardJson` names are used consistently between definition and call sites.
