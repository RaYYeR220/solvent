# Solvent Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and unit-test the off-chain decision core of the Solvent agent — pure signal→regime→action logic, the attestation hash, the on-chain action encoder, the tick orchestrator, and a viem-backed vault sender — all against typed interfaces and mocks, with zero live-chain dependency.

**Architecture:** The agent is a stateless decision engine. Each tick it gathers `Signals` (NAV, market price, liquidity depth, vault balance, oracle divergence) through narrow adapter interfaces, runs two pure functions (`assessRegime`, `selectAction`) to choose a policy-bounded `ActionPlan`, encodes it to match the on-chain `SolventVault.executeProtectiveAction` ABI, and submits it (or attests a no-action observation) via a `VaultSender`. Real protocol read-adapters (Ondo NAV oracle, DEX pool price/liquidity) and the live interval loop are deferred to the integration phase (tested on a Mantle fork in the harness plan); this plan delivers the fully-tested brain + encoder + sender + config.

**Tech Stack:** TypeScript (ESM, strict), viem (ABI encoding, keccak256, chain client), vitest (tests), tsx (run). Node ≥ 20.

---

## Context from Plan 1 (contracts)

The deployed `SolventVault` exposes (enums encode as `uint8`):
- `executeProtectiveAction(uint8 action, bytes params, uint8 regime, bytes32 reasonCode, bytes32 signalsHash)`
- `attestObservation(uint8 regime, bytes32 reasonCode, bytes32 signalsHash)`

`params` per action (must match the Solidity `abi.decode` in the handlers):
- `SWAP_TO_SAFE` → `(uint256 amountIn, uint256 amountOutMin, address[] path)` where `path = [asset, safeAsset]`.
- `BRIDGE_VIA_LENDING` → `(uint256 collateralAmount, uint256 borrowAmount)`.
- `UNWIND_BRIDGE` → `(uint256 repayAmount, uint256 withdrawAmount)`.
- `PARK_YIELD` → `(uint256 amount)`.

Enum values (MUST mirror `contracts/src/Policy.sol`): `ActionType { NONE=0, SWAP_TO_SAFE=1, BRIDGE_VIA_LENDING=2, UNWIND_BRIDGE=3, PARK_YIELD=4 }`, `Regime { CALM=0, WATCH=1, EARLY_DEPEG=2, TERMINAL_DEPEG=3 }`.

The vault's on-chain swap floor is `amountIn*(10000-maxSlippageBps)*10^safeDec/(10000*10^assetDec)`; the agent must compute `amountOutMin` to be ≥ this floor, and `borrowAmount` ≤ `collateral*maxBridgeLTVBps*10^safeDec/(10000*10^assetDec)`, or the tx reverts.

---

## File Structure

```
agent/
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
  src/
    types.ts                # enums, Signals, AgentPolicy, ActionPlan, Decision, helpers
    engine/
      assessRegime.ts       # pure: (Signals, AgentPolicy) -> Regime
      selectAction.ts       # pure: (Regime, Signals, AgentPolicy) -> Decision (+ minSafeOut, maxBorrow)
    adapters/
      types.ts              # NavSource, PriceSource, LiquiditySource, PositionSource
      mocks.ts              # constant/settable in-memory adapters for tests
    signals.ts              # gatherSignals(SignalSources) -> Signals
    attest.ts               # computeSignalsHash, encodeReasonCode
    executor/
      vaultAbi.ts           # executeProtectiveAction + attestObservation ABI fragment
      encodeAction.ts       # ActionPlan -> params bytes
      viemSender.ts         # createViemSender(client, vault) -> VaultSender
    config.ts               # loadConfig(env) -> Config
  test/
    types.test.ts
    assessRegime.test.ts
    selectAction.test.ts
    signals.test.ts
    attest.test.ts
    encodeAction.test.ts
    viemSender.test.ts
    config.test.ts
    loop.test.ts
  src/loop.ts               # runTick(TickDeps) orchestration + VaultSender interface
```

**Responsibility split:** `types.ts` is the shared vocabulary. `engine/` holds the two pure decision functions (the heart, tested hardest). `adapters/` defines the I/O seams + mocks. `signals.ts` assembles a `Signals` snapshot. `attest.ts` derives the on-chain attestation fields. `executor/` encodes actions and sends txs. `loop.ts` wires a single tick. Real chain read-adapters and the interval runner are intentionally out of scope (integration phase).

---

## Task 1: Scaffold the agent TypeScript package

**Files:**
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `agent/vitest.config.ts`
- Create: `agent/.env.example`
- Create: `agent/test/scaffold.test.ts`
- Create: `agent/src/version.ts`

- [ ] **Step 1: Create package.json**

`agent/package.json`:
```json
{
  "name": "solvent-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

`agent/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create vitest.config.ts and .env.example**

`agent/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

`agent/.env.example`:
```
MANTLE_RPC_URL=
AGENT_PRIVATE_KEY=
VAULT_ADDRESS=
ASSET_ADDRESS=
SAFE_ASSET_ADDRESS=
POLL_INTERVAL_MS=15000
WATCH_DIVERGENCE_BPS=25
EARLY_DIVERGENCE_BPS=50
TERMINAL_DIVERGENCE_BPS=500
MAX_ORACLE_DIVERGENCE_BPS=200
LIQUIDITY_FLOOR=0
MAX_SLIPPAGE_BPS=300
MAX_BRIDGE_LTV_BPS=5000
ASSET_DECIMALS=18
SAFE_DECIMALS=6
ALLOWED_ACTIONS=30
```
(`ALLOWED_ACTIONS=30` = bits for SWAP_TO_SAFE|BRIDGE|UNWIND|PARK = `2+4+8+16`.)

- [ ] **Step 4: Write the scaffold module + test**

`agent/src/version.ts`:
```ts
export const AGENT_NAME = "solvent-agent";
export const AGENT_VERSION = "0.1.0";
```

`agent/test/scaffold.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { AGENT_NAME, AGENT_VERSION } from "../src/version";

describe("scaffold", () => {
  it("exposes agent identity constants", () => {
    expect(AGENT_NAME).toBe("solvent-agent");
    expect(AGENT_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 5: Install and test**

Run (from `agent/`): `npm install` then `npm test`
Expected: vitest runs; `scaffold` test PASSES. Then `npm run typecheck` — no errors.

- [ ] **Step 6: Commit**

```bash
git add agent/package.json agent/tsconfig.json agent/vitest.config.ts agent/.env.example agent/src/version.ts agent/test/scaffold.test.ts agent/package-lock.json
git commit -m "chore(agent): scaffold TypeScript agent package with vitest"
```

---

## Task 2: Core types and helpers

**Files:**
- Create: `agent/src/types.ts`
- Create: `agent/test/types.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ActionType, Regime, isActionAllowed, divergenceBps, type AgentPolicy, type Signals } from "../src/types";

const policy: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6,
  allowedActions: (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.PARK_YIELD),
};

function sig(nav: bigint, market: bigint): Signals {
  return { navPrice: nav, marketPrice: market, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: 0, timestamp: 0 };
}

describe("isActionAllowed", () => {
  it("respects the bitmap and never allows NONE", () => {
    expect(isActionAllowed(policy, ActionType.SWAP_TO_SAFE)).toBe(true);
    expect(isActionAllowed(policy, ActionType.PARK_YIELD)).toBe(true);
    expect(isActionAllowed(policy, ActionType.BRIDGE_VIA_LENDING)).toBe(false);
    expect(isActionAllowed(policy, ActionType.NONE)).toBe(false);
  });
});

describe("divergenceBps", () => {
  it("is zero when market >= nav (no depeg)", () => {
    expect(divergenceBps(sig(10n ** 18n, 10n ** 18n))).toBe(0);
    expect(divergenceBps(sig(10n ** 18n, 2n * 10n ** 18n))).toBe(0);
  });
  it("measures the downward gap in bps of nav", () => {
    // nav 1.00, market 0.95 -> 500 bps
    expect(divergenceBps(sig(10n ** 18n, 95n * 10n ** 16n))).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `agent/`): `npx vitest run test/types.test.ts`
Expected: FAIL — `../src/types` does not exist.

- [ ] **Step 3: Write the implementation**

`agent/src/types.ts`:
```ts
export type Address = `0x${string}`;

/** Mirrors contracts/src/Policy.sol ActionType (NONE=0). */
export enum ActionType {
  NONE = 0,
  SWAP_TO_SAFE = 1,
  BRIDGE_VIA_LENDING = 2,
  UNWIND_BRIDGE = 3,
  PARK_YIELD = 4,
}

/** Mirrors contracts/src/Policy.sol Regime. */
export enum Regime {
  CALM = 0,
  WATCH = 1,
  EARLY_DEPEG = 2,
  TERMINAL_DEPEG = 3,
}

/** A snapshot of the world at one tick. Prices normalized to 1e18; amounts in token-native units. */
export interface Signals {
  navPrice: bigint; // backing value (Ondo NAV / exchange rate), 1e18
  marketPrice: bigint; // DEX market price, 1e18
  liquidityDepth: bigint; // max asset sellable into safe within slippage, asset-native units
  assetBalance: bigint; // vault's current asset holding, asset-native units
  oracleDivergenceBps: number; // spread between independent price sources, bps
  timestamp: number; // unix seconds
}

/** Agent-side risk config. Superset of the on-chain Policy (adds off-chain-only tuning). */
export interface AgentPolicy {
  watchDivergenceBps: number;
  earlyDivergenceBps: number;
  terminalDivergenceBps: number;
  maxOracleDivergenceBps: number; // above this, the price signal is untrusted
  liquidityFloor: bigint; // asset-native units
  maxSlippageBps: number; // mirrors on-chain
  maxBridgeLTVBps: number; // mirrors on-chain
  assetDecimals: number;
  safeDecimals: number;
  allowedActions: number; // bitmap: bit (1 << ActionType)
}

export type ActionPlan =
  | { action: ActionType.NONE }
  | { action: ActionType.SWAP_TO_SAFE; amountIn: bigint; amountOutMin: bigint }
  | { action: ActionType.BRIDGE_VIA_LENDING; collateralAmount: bigint; borrowAmount: bigint }
  | { action: ActionType.UNWIND_BRIDGE; repayAmount: bigint; withdrawAmount: bigint }
  | { action: ActionType.PARK_YIELD; amount: bigint };

export interface Decision {
  regime: Regime;
  plan: ActionPlan;
  reasonCode: string; // short code, e.g. "early-exit" (encoded to bytes32 at send time)
}

export function isActionAllowed(p: AgentPolicy, a: ActionType): boolean {
  if (a === ActionType.NONE) return false;
  return (p.allowedActions & (1 << a)) !== 0;
}

/** Downward divergence of market price below backing value (NAV), in bps of NAV. 0 if market >= nav. */
export function divergenceBps(s: Signals): number {
  if (s.navPrice <= 0n || s.marketPrice >= s.navPrice) return 0;
  return Number(((s.navPrice - s.marketPrice) * 10000n) / s.navPrice);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/types.test.ts` → PASS. Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/types.ts agent/test/types.test.ts
git commit -m "feat(agent): add core types, action bitmap, and divergence helper"
```

---

## Task 3: assessRegime (pure regime classifier)

**Files:**
- Create: `agent/src/engine/assessRegime.ts`
- Create: `agent/test/assessRegime.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/assessRegime.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assessRegime } from "../src/engine/assessRegime";
import { Regime, type AgentPolicy, type Signals } from "../src/types";

const p: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: 0,
};

const ONE = 10n ** 18n;
function s(marketFractionBps: number, oracleDivBps = 0): Signals {
  // marketPrice = nav * (1 - marketFractionBps/10000)
  const market = (ONE * BigInt(10000 - marketFractionBps)) / 10000n;
  return { navPrice: ONE, marketPrice: market, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: oracleDivBps, timestamp: 0 };
}

describe("assessRegime", () => {
  it("CALM when divergence below watch threshold", () => {
    expect(assessRegime(s(10), p)).toBe(Regime.CALM);
  });
  it("WATCH between watch and early thresholds", () => {
    expect(assessRegime(s(30), p)).toBe(Regime.WATCH);
  });
  it("EARLY_DEPEG between early and terminal thresholds", () => {
    expect(assessRegime(s(100), p)).toBe(Regime.EARLY_DEPEG);
  });
  it("TERMINAL_DEPEG at or above terminal threshold", () => {
    expect(assessRegime(s(500), p)).toBe(Regime.TERMINAL_DEPEG);
    expect(assessRegime(s(900), p)).toBe(Regime.TERMINAL_DEPEG);
  });
  it("does NOT escalate on untrusted (high oracle divergence) data -> WATCH", () => {
    expect(assessRegime(s(900, 300), p)).toBe(Regime.WATCH);
  });
  it("CALM when market above nav (premium, not a depeg)", () => {
    const premium: Signals = { ...s(0), marketPrice: ONE + ONE / 100n };
    expect(assessRegime(premium, p)).toBe(Regime.CALM);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/assessRegime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`agent/src/engine/assessRegime.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/assessRegime.test.ts` → all PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/engine/assessRegime.ts agent/test/assessRegime.test.ts
git commit -m "feat(agent): add assessRegime regime classifier with untrusted-data guard"
```

---

## Task 4: selectAction (pure action policy)

**Files:**
- Create: `agent/src/engine/selectAction.ts`
- Create: `agent/test/selectAction.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/selectAction.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectAction, minSafeOut, maxBorrow } from "../src/engine/selectAction";
import { ActionType, Regime, type AgentPolicy, type Signals } from "../src/types";

const ONE = 10n ** 18n;

function policy(allowed: number): AgentPolicy {
  return {
    watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
    maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
    maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: allowed,
  };
}
const ALL =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

function signals(over: Partial<Signals> = {}): Signals {
  return { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, assetBalance: 100n * ONE, oracleDivergenceBps: 0, timestamp: 0, ...over };
}

describe("minSafeOut / maxBorrow", () => {
  it("mirror the on-chain decimal-adjusted formulas", () => {
    // 100e18 asset, 3% slippage, 18->6 decimals -> 97e6
    expect(minSafeOut(100n * ONE, policy(ALL))).toBe(97n * 10n ** 6n);
    // 200e18 collateral, 50% LTV -> 100e6
    expect(maxBorrow(200n * ONE, policy(ALL))).toBe(100n * 10n ** 6n);
  });
});

describe("selectAction", () => {
  it("CALM -> park yield when allowed and balance > 0", () => {
    const d = selectAction(Regime.CALM, signals(), policy(ALL));
    expect(d.plan.action).toBe(ActionType.PARK_YIELD);
    expect(d.reasonCode).toBe("park-calm");
  });
  it("CALM with park disallowed -> NONE", () => {
    const d = selectAction(Regime.CALM, signals(), policy(1 << ActionType.SWAP_TO_SAFE));
    expect(d.plan.action).toBe(ActionType.NONE);
  });
  it("WATCH -> no action (observation)", () => {
    const d = selectAction(Regime.WATCH, signals(), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("watch");
  });
  it("EARLY_DEPEG with enough liquidity -> early exit (swap)", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 100n * ONE }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("early-exit");
    if (d.plan.action === ActionType.SWAP_TO_SAFE) {
      expect(d.plan.amountIn).toBe(100n * ONE);
      expect(d.plan.amountOutMin).toBe(97n * 10n ** 6n);
    }
  });
  it("EARLY_DEPEG when illiquid -> liquidity bridge", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 1n }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.BRIDGE_VIA_LENDING);
    expect(d.reasonCode).toBe("liquidity-bridge");
    if (d.plan.action === ActionType.BRIDGE_VIA_LENDING) {
      expect(d.plan.collateralAmount).toBe(100n * ONE);
      expect(d.plan.borrowAmount).toBe(50n * 10n ** 6n); // 50% of 100 units at 1:1, decimal-adjusted
    }
  });
  it("EARLY_DEPEG illiquid with no bridge allowed -> NONE protect-failed", () => {
    const d = selectAction(Regime.EARLY_DEPEG, signals({ liquidityDepth: 1n }), policy(1 << ActionType.SWAP_TO_SAFE));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-illiquid");
  });
  it("TERMINAL_DEPEG with liquidity -> forced exit", () => {
    const d = selectAction(Regime.TERMINAL_DEPEG, signals({ liquidityDepth: 100n * ONE }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(d.reasonCode).toBe("terminal-exit");
  });
  it("TERMINAL_DEPEG illiquid -> NONE protect-failed (no bridge in terminal)", () => {
    const d = selectAction(Regime.TERMINAL_DEPEG, signals({ liquidityDepth: 1n }), policy(ALL));
    expect(d.plan.action).toBe(ActionType.NONE);
    expect(d.reasonCode).toBe("protect-failed-illiquid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/selectAction.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`agent/src/engine/selectAction.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/selectAction.test.ts` → all PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/engine/selectAction.ts agent/test/selectAction.test.ts
git commit -m "feat(agent): add selectAction policy with liquidity-aware exit/bridge logic"
```

---

## Task 5: Adapter interfaces, mocks, and gatherSignals

**Files:**
- Create: `agent/src/adapters/types.ts`
- Create: `agent/src/adapters/mocks.ts`
- Create: `agent/src/signals.ts`
- Create: `agent/test/signals.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/signals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gatherSignals } from "../src/signals";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../src/adapters/mocks";

const ONE = 10n ** 18n;

describe("gatherSignals", () => {
  it("assembles a Signals snapshot from the sources", async () => {
    const s = await gatherSignals({
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(95n * 10n ** 16n),
      liquidity: new MockLiquiditySource(42n * ONE),
      position: new MockPositionSource(7n * ONE),
    });
    expect(s.navPrice).toBe(ONE);
    expect(s.marketPrice).toBe(95n * 10n ** 16n);
    expect(s.liquidityDepth).toBe(42n * ONE);
    expect(s.assetBalance).toBe(7n * ONE);
    expect(s.oracleDivergenceBps).toBe(0); // no cross-check source
    expect(s.timestamp).toBeGreaterThan(0);
  });

  it("computes oracle divergence in bps between primary and cross-check price", async () => {
    const s = await gatherSignals({
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(100n * 10n ** 16n), // 1.00
      priceCrossCheck: new MockPriceSource(98n * 10n ** 16n), // 0.98 -> 200 bps spread
      liquidity: new MockLiquiditySource(0n),
      position: new MockPositionSource(0n),
    });
    expect(s.oracleDivergenceBps).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/signals.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementations**

`agent/src/adapters/types.ts`:
```ts
/** Backing value of the asset (Ondo NAV / staking exchange rate), normalized to 1e18. */
export interface NavSource {
  getNavPrice(): Promise<bigint>;
}

/** Market price of the asset (e.g. DEX pool spot or an oracle), normalized to 1e18. */
export interface PriceSource {
  getMarketPrice(): Promise<bigint>;
}

/** Max asset amount sellable into the safe asset within acceptable slippage, asset-native units. */
export interface LiquiditySource {
  getLiquidityDepth(): Promise<bigint>;
}

/** The vault's current asset holding, asset-native units. */
export interface PositionSource {
  getAssetBalance(): Promise<bigint>;
}
```

`agent/src/adapters/mocks.ts`:
```ts
import type { LiquiditySource, NavSource, PositionSource, PriceSource } from "./types";

export class MockNavSource implements NavSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getNavPrice(): Promise<bigint> { return this.value; }
}

export class MockPriceSource implements PriceSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getMarketPrice(): Promise<bigint> { return this.value; }
}

export class MockLiquiditySource implements LiquiditySource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getLiquidityDepth(): Promise<bigint> { return this.value; }
}

export class MockPositionSource implements PositionSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getAssetBalance(): Promise<bigint> { return this.value; }
}
```

`agent/src/signals.ts`:
```ts
import type { LiquiditySource, NavSource, PositionSource, PriceSource } from "./adapters/types";
import type { Signals } from "./types";

export interface SignalSources {
  nav: NavSource;
  price: PriceSource;
  priceCrossCheck?: PriceSource;
  liquidity: LiquiditySource;
  position: PositionSource;
}

/** Reads all sources (primary in parallel) and assembles a Signals snapshot. */
export async function gatherSignals(src: SignalSources): Promise<Signals> {
  const [navPrice, marketPrice, liquidityDepth, assetBalance] = await Promise.all([
    src.nav.getNavPrice(),
    src.price.getMarketPrice(),
    src.liquidity.getLiquidityDepth(),
    src.position.getAssetBalance(),
  ]);

  let oracleDivergenceBps = 0;
  if (src.priceCrossCheck) {
    const alt = await src.priceCrossCheck.getMarketPrice();
    const hi = marketPrice > alt ? marketPrice : alt;
    const lo = marketPrice > alt ? alt : marketPrice;
    oracleDivergenceBps = hi > 0n ? Number(((hi - lo) * 10000n) / hi) : 0;
  }

  return {
    navPrice,
    marketPrice,
    liquidityDepth,
    assetBalance,
    oracleDivergenceBps,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/signals.test.ts` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/adapters/types.ts agent/src/adapters/mocks.ts agent/src/signals.ts agent/test/signals.test.ts
git commit -m "feat(agent): add signal adapter interfaces, mocks, and gatherSignals"
```

---

## Task 6: Attestation hash and reason-code encoding

**Files:**
- Create: `agent/src/attest.ts`
- Create: `agent/test/attest.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/attest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeSignalsHash, encodeReasonCode } from "../src/attest";
import { hexToString } from "viem";
import type { Signals } from "../src/types";

const ONE = 10n ** 18n;
const base: Signals = { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: 0, timestamp: 1700000000 };

describe("computeSignalsHash", () => {
  it("returns a 32-byte hex hash", () => {
    const h = computeSignalsHash(base);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("is deterministic for identical signals", () => {
    expect(computeSignalsHash(base)).toBe(computeSignalsHash({ ...base }));
  });
  it("changes when any signal changes", () => {
    expect(computeSignalsHash(base)).not.toBe(computeSignalsHash({ ...base, marketPrice: ONE - 1n }));
  });
});

describe("encodeReasonCode", () => {
  it("encodes a short code into a right-padded bytes32 readable back", () => {
    const enc = encodeReasonCode("early-exit");
    expect(enc).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hexToString(enc, { size: 32 })).toBe("early-exit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/attest.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`agent/src/attest.ts`:
```ts
import { encodeAbiParameters, keccak256, stringToHex } from "viem";
import type { Signals } from "./types";

/** Deterministic hash of the signal snapshot, recorded on-chain as evidence for a decision. */
export function computeSignalsHash(s: Signals): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
    [s.navPrice, s.marketPrice, s.liquidityDepth, s.assetBalance, BigInt(s.timestamp)],
  );
  return keccak256(encoded);
}

/** Encodes a short reason string into a right-padded bytes32 (max 31 chars). */
export function encodeReasonCode(code: string): `0x${string}` {
  return stringToHex(code, { size: 32 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/attest.test.ts` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/attest.ts agent/test/attest.test.ts
git commit -m "feat(agent): add signals-hash and reason-code encoding"
```

---

## Task 7: Vault ABI and action encoder

**Files:**
- Create: `agent/src/executor/vaultAbi.ts`
- Create: `agent/src/executor/encodeAction.ts`
- Create: `agent/test/encodeAction.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/encodeAction.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encodeActionParams } from "../src/executor/encodeAction";
import { ActionType, type Address } from "../src/types";
import { decodeAbiParameters } from "viem";

const ASSET = "0x1111111111111111111111111111111111111111" as Address;
const SAFE = "0x2222222222222222222222222222222222222222" as Address;
const ctx = { asset: ASSET, safeAsset: SAFE };
const ONE = 10n ** 18n;

describe("encodeActionParams", () => {
  it("encodes SWAP_TO_SAFE as (uint256,uint256,address[]) with path [asset, safe]", () => {
    const enc = encodeActionParams({ action: ActionType.SWAP_TO_SAFE, amountIn: 100n * ONE, amountOutMin: 97n * 10n ** 6n }, ctx);
    const [amountIn, amountOutMin, path] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }],
      enc,
    );
    expect(amountIn).toBe(100n * ONE);
    expect(amountOutMin).toBe(97n * 10n ** 6n);
    expect(path).toEqual([ASSET, SAFE]);
  });

  it("encodes BRIDGE_VIA_LENDING as (uint256,uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 200n * ONE, borrowAmount: 100n * 10n ** 6n }, ctx);
    const [collateral, borrow] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], enc);
    expect(collateral).toBe(200n * ONE);
    expect(borrow).toBe(100n * 10n ** 6n);
  });

  it("encodes UNWIND_BRIDGE as (uint256,uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.UNWIND_BRIDGE, repayAmount: 100n * 10n ** 6n, withdrawAmount: 200n * ONE }, ctx);
    const [repay, withdraw] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], enc);
    expect(repay).toBe(100n * 10n ** 6n);
    expect(withdraw).toBe(200n * ONE);
  });

  it("encodes PARK_YIELD as (uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.PARK_YIELD, amount: 300n * ONE }, ctx);
    const [amount] = decodeAbiParameters([{ type: "uint256" }], enc);
    expect(amount).toBe(300n * ONE);
  });

  it("encodes NONE as empty bytes", () => {
    expect(encodeActionParams({ action: ActionType.NONE }, ctx)).toBe("0x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/encodeAction.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementations**

`agent/src/executor/vaultAbi.ts`:
```ts
/** Minimal ABI fragment of SolventVault the agent calls. Enums encode as uint8. */
export const vaultAbi = [
  {
    type: "function",
    name: "executeProtectiveAction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "uint8" },
      { name: "params", type: "bytes" },
      { name: "regime", type: "uint8" },
      { name: "reasonCode", type: "bytes32" },
      { name: "signalsHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestObservation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "regime", type: "uint8" },
      { name: "reasonCode", type: "bytes32" },
      { name: "signalsHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
```

`agent/src/executor/encodeAction.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/encodeAction.test.ts` → all PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/executor/vaultAbi.ts agent/src/executor/encodeAction.ts agent/test/encodeAction.test.ts
git commit -m "feat(agent): add vault ABI fragment and action param encoder"
```

---

## Task 8: runTick orchestration

**Files:**
- Create: `agent/src/loop.ts`
- Create: `agent/test/loop.test.ts`

- [ ] **Step 1: Write the failing test**

`agent/test/loop.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runTick, type VaultSender, type TickDeps } from "../src/loop";
import { ActionType, Regime, type AgentPolicy, type Address } from "../src/types";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../src/adapters/mocks";

const ONE = 10n ** 18n;
const ASSET = "0x1111111111111111111111111111111111111111" as Address;
const SAFE = "0x2222222222222222222222222222222222222222" as Address;

const ALL =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

const policy: AgentPolicy = {
  watchDivergenceBps: 25, earlyDivergenceBps: 50, terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 200, liquidityFloor: 0n, maxSlippageBps: 300,
  maxBridgeLTVBps: 5000, assetDecimals: 18, safeDecimals: 6, allowedActions: ALL,
};

class RecordingSender implements VaultSender {
  public execCalls: Parameters<VaultSender["executeProtectiveAction"]>[0][] = [];
  public obsCalls: Parameters<VaultSender["attestObservation"]>[0][] = [];
  async executeProtectiveAction(a: Parameters<VaultSender["executeProtectiveAction"]>[0]) { this.execCalls.push(a); return "0xexec" as const; }
  async attestObservation(a: Parameters<VaultSender["attestObservation"]>[0]) { this.obsCalls.push(a); return "0xobs" as const; }
}

function deps(market: bigint, liquidity: bigint, balance: bigint, sender: RecordingSender): TickDeps {
  return {
    sources: {
      nav: new MockNavSource(ONE),
      price: new MockPriceSource(market),
      liquidity: new MockLiquiditySource(liquidity),
      position: new MockPositionSource(balance),
    },
    policy,
    sender,
    addresses: { asset: ASSET, safeAsset: SAFE },
  };
}

describe("runTick", () => {
  it("CALM -> parks yield via executeProtectiveAction", async () => {
    const sender = new RecordingSender();
    const res = await runTick(deps(ONE, 0n, 100n * ONE, sender)); // market == nav -> CALM
    expect(res.decision.regime).toBe(Regime.CALM);
    expect(sender.execCalls).toHaveLength(1);
    expect(sender.execCalls[0]!.action).toBe(ActionType.PARK_YIELD);
    expect(sender.obsCalls).toHaveLength(0);
    expect(res.txHash).toBe("0xexec");
  });

  it("WATCH -> attests an observation (no fund movement)", async () => {
    const sender = new RecordingSender();
    const market = (ONE * 9970n) / 10000n; // 30 bps depeg -> WATCH
    const res = await runTick(deps(market, 0n, 100n * ONE, sender));
    expect(res.decision.regime).toBe(Regime.WATCH);
    expect(sender.obsCalls).toHaveLength(1);
    expect(sender.execCalls).toHaveLength(0);
    expect(res.txHash).toBe("0xobs");
  });

  it("EARLY_DEPEG with liquidity -> sends a swap with encoded params + bytes32 fields", async () => {
    const sender = new RecordingSender();
    const market = (ONE * 9900n) / 10000n; // 100 bps -> EARLY
    const res = await runTick(deps(market, 100n * ONE, 100n * ONE, sender));
    expect(res.decision.regime).toBe(Regime.EARLY_DEPEG);
    expect(sender.execCalls).toHaveLength(1);
    const call = sender.execCalls[0]!;
    expect(call.action).toBe(ActionType.SWAP_TO_SAFE);
    expect(call.regime).toBe(Regime.EARLY_DEPEG);
    expect(call.params).toMatch(/^0x[0-9a-f]+$/);
    expect(call.reasonCode).toMatch(/^0x[0-9a-f]{64}$/);
    expect(call.signalsHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/loop.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`agent/src/loop.ts`:
```ts
import { ActionType, type AgentPolicy, type Address, type Decision } from "./types";
import { gatherSignals, type SignalSources } from "./signals";
import { assessRegime } from "./engine/assessRegime";
import { selectAction } from "./engine/selectAction";
import { computeSignalsHash, encodeReasonCode } from "./attest";
import { encodeActionParams } from "./executor/encodeAction";

export interface ExecuteArgs {
  action: number;
  params: `0x${string}`;
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
}

export interface ObserveArgs {
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
}

export interface VaultSender {
  executeProtectiveAction(args: ExecuteArgs): Promise<`0x${string}`>;
  attestObservation(args: ObserveArgs): Promise<`0x${string}`>;
}

export interface TickDeps {
  sources: SignalSources;
  policy: AgentPolicy;
  sender: VaultSender;
  addresses: { asset: Address; safeAsset: Address };
}

export interface TickResult {
  decision: Decision;
  txHash: `0x${string}` | null;
}

/** One decision cycle: gather signals -> assess regime -> select action -> submit (or observe). */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const signals = await gatherSignals(deps.sources);
  const regime = assessRegime(signals, deps.policy);
  const decision = selectAction(regime, signals, deps.policy);

  const signalsHash = computeSignalsHash(signals);
  const reasonCode = encodeReasonCode(decision.reasonCode);

  if (decision.plan.action === ActionType.NONE) {
    const txHash = await deps.sender.attestObservation({ regime, reasonCode, signalsHash });
    return { decision, txHash };
  }

  const params = encodeActionParams(decision.plan, deps.addresses);
  const txHash = await deps.sender.executeProtectiveAction({
    action: decision.plan.action,
    params,
    regime,
    reasonCode,
    signalsHash,
  });
  return { decision, txHash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/loop.test.ts` → all PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/loop.ts agent/test/loop.test.ts
git commit -m "feat(agent): add runTick orchestration with VaultSender seam"
```

---

## Task 9: Config loader and viem-backed VaultSender

**Files:**
- Create: `agent/src/config.ts`
- Create: `agent/src/executor/viemSender.ts`
- Create: `agent/test/config.test.ts`
- Create: `agent/test/viemSender.test.ts`

- [ ] **Step 1: Write the failing tests**

`agent/test/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";
import { ActionType } from "../src/types";

const env = {
  MANTLE_RPC_URL: "https://rpc.mantle.xyz",
  AGENT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  VAULT_ADDRESS: "0x1111111111111111111111111111111111111111",
  ASSET_ADDRESS: "0x2222222222222222222222222222222222222222",
  SAFE_ASSET_ADDRESS: "0x3333333333333333333333333333333333333333",
  POLL_INTERVAL_MS: "15000",
  WATCH_DIVERGENCE_BPS: "25",
  EARLY_DIVERGENCE_BPS: "50",
  TERMINAL_DIVERGENCE_BPS: "500",
  MAX_ORACLE_DIVERGENCE_BPS: "200",
  LIQUIDITY_FLOOR: "0",
  MAX_SLIPPAGE_BPS: "300",
  MAX_BRIDGE_LTV_BPS: "5000",
  ASSET_DECIMALS: "18",
  SAFE_DECIMALS: "6",
  ALLOWED_ACTIONS: "30",
};

describe("loadConfig", () => {
  it("parses a complete env into a typed Config", () => {
    const c = loadConfig(env);
    expect(c.rpcUrl).toBe("https://rpc.mantle.xyz");
    expect(c.vaultAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(c.pollIntervalMs).toBe(15000);
    expect(c.policy.earlyDivergenceBps).toBe(50);
    expect(c.policy.liquidityFloor).toBe(0n);
    expect(c.policy.allowedActions).toBe(30);
    expect((c.policy.allowedActions & (1 << ActionType.SWAP_TO_SAFE)) !== 0).toBe(true);
  });

  it("throws a clear error when a required field is missing", () => {
    const { VAULT_ADDRESS, ...incomplete } = env;
    expect(() => loadConfig(incomplete)).toThrowError(/VAULT_ADDRESS/);
  });

  it("throws on a malformed address", () => {
    expect(() => loadConfig({ ...env, VAULT_ADDRESS: "nope" })).toThrowError(/VAULT_ADDRESS/);
  });
});
```

`agent/test/viemSender.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createViemSender, type WriteClient } from "../src/executor/viemSender";
import { vaultAbi } from "../src/executor/vaultAbi";
import { ActionType, Regime, type Address } from "../src/types";

const VAULT = "0x1111111111111111111111111111111111111111" as Address;

class FakeWriteClient implements WriteClient {
  public calls: any[] = [];
  async writeContract(req: any): Promise<`0x${string}`> {
    this.calls.push(req);
    return "0xdeadbeef";
  }
}

describe("createViemSender", () => {
  it("calls writeContract with executeProtectiveAction args", async () => {
    const client = new FakeWriteClient();
    const sender = createViemSender(client, VAULT);
    const tx = await sender.executeProtectiveAction({
      action: ActionType.SWAP_TO_SAFE, params: "0x1234", regime: Regime.EARLY_DEPEG,
      reasonCode: ("0x" + "00".repeat(32)) as `0x${string}`, signalsHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    });
    expect(tx).toBe("0xdeadbeef");
    expect(client.calls).toHaveLength(1);
    const req = client.calls[0];
    expect(req.address).toBe(VAULT);
    expect(req.abi).toBe(vaultAbi);
    expect(req.functionName).toBe("executeProtectiveAction");
    expect(req.args).toEqual([ActionType.SWAP_TO_SAFE, "0x1234", Regime.EARLY_DEPEG, ("0x" + "00".repeat(32)), ("0x" + "11".repeat(32))]);
  });

  it("calls writeContract with attestObservation args", async () => {
    const client = new FakeWriteClient();
    const sender = createViemSender(client, VAULT);
    await sender.attestObservation({
      regime: Regime.WATCH, reasonCode: ("0x" + "00".repeat(32)) as `0x${string}`, signalsHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    });
    expect(client.calls[0].functionName).toBe("attestObservation");
    expect(client.calls[0].args).toEqual([Regime.WATCH, ("0x" + "00".repeat(32)), ("0x" + "11".repeat(32))]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/config.test.ts test/viemSender.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementations**

`agent/src/config.ts`:
```ts
import type { Address, AgentPolicy } from "./types";

export interface Config {
  rpcUrl: string;
  agentPrivateKey: `0x${string}`;
  vaultAddress: Address;
  asset: Address;
  safeAsset: Address;
  pollIntervalMs: number;
  policy: AgentPolicy;
}

type Env = Record<string, string | undefined>;

function req(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v === "") throw new Error(`Missing required config: ${key}`);
  return v;
}

function reqAddress(env: Env, key: string): Address {
  const v = req(env, key);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`Invalid address for ${key}: ${v}`);
  return v as Address;
}

function reqInt(env: Env, key: string): number {
  const v = req(env, key);
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
}

export function loadConfig(env: Env): Config {
  const pk = req(env, "AGENT_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Invalid AGENT_PRIVATE_KEY");

  const policy: AgentPolicy = {
    watchDivergenceBps: reqInt(env, "WATCH_DIVERGENCE_BPS"),
    earlyDivergenceBps: reqInt(env, "EARLY_DIVERGENCE_BPS"),
    terminalDivergenceBps: reqInt(env, "TERMINAL_DIVERGENCE_BPS"),
    maxOracleDivergenceBps: reqInt(env, "MAX_ORACLE_DIVERGENCE_BPS"),
    liquidityFloor: BigInt(req(env, "LIQUIDITY_FLOOR")),
    maxSlippageBps: reqInt(env, "MAX_SLIPPAGE_BPS"),
    maxBridgeLTVBps: reqInt(env, "MAX_BRIDGE_LTV_BPS"),
    assetDecimals: reqInt(env, "ASSET_DECIMALS"),
    safeDecimals: reqInt(env, "SAFE_DECIMALS"),
    allowedActions: reqInt(env, "ALLOWED_ACTIONS"),
  };

  return {
    rpcUrl: req(env, "MANTLE_RPC_URL"),
    agentPrivateKey: pk as `0x${string}`,
    vaultAddress: reqAddress(env, "VAULT_ADDRESS"),
    asset: reqAddress(env, "ASSET_ADDRESS"),
    safeAsset: reqAddress(env, "SAFE_ASSET_ADDRESS"),
    pollIntervalMs: reqInt(env, "POLL_INTERVAL_MS"),
    policy,
  };
}
```

`agent/src/executor/viemSender.ts`:
```ts
import type { Address } from "../types";
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../loop";
import { vaultAbi } from "./vaultAbi";

/** The slice of a viem WalletClient we use (kept narrow so it's trivial to fake in tests). */
export interface WriteClient {
  writeContract(req: {
    address: Address;
    abi: typeof vaultAbi;
    functionName: "executeProtectiveAction" | "attestObservation";
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
}

/** Builds a VaultSender that submits txs to the on-chain vault via a viem write client. */
export function createViemSender(client: WriteClient, vault: Address): VaultSender {
  return {
    async executeProtectiveAction(a: ExecuteArgs): Promise<`0x${string}`> {
      return client.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "executeProtectiveAction",
        args: [a.action, a.params, a.regime, a.reasonCode, a.signalsHash],
      });
    },
    async attestObservation(a: ObserveArgs): Promise<`0x${string}`> {
      return client.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "attestObservation",
        args: [a.regime, a.reasonCode, a.signalsHash],
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/config.test.ts test/viemSender.test.ts` → PASS. Then the whole suite: `npm test` (expect all green). `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add agent/src/config.ts agent/src/executor/viemSender.ts agent/test/config.test.ts agent/test/viemSender.test.ts
git commit -m "feat(agent): add config loader and viem-backed vault sender"
```

---

## Deferred to the integration phase (next plan / harness)

Not part of this plan — these need live addresses and a Mantle fork, and are tested there:
- Real read-adapters implementing the adapter interfaces: `OndoNavSource` (read `RWADynamicOracle.getPrice()` on Mantle, or its Web2 mirror), `DexPriceSource` (read pool spot price), `DexLiquiditySource` (compute max sellable within slippage from pool reserves), `VaultPositionSource` (read the vault's asset balance), optional Pyth/RedStone cross-check.
- The interval runner (`main()` calling `runTick` every `pollIntervalMs`, with a real viem wallet client and `account` for `writeContract`, plus error handling/backoff).
- Wiring `createViemSender` with a real `createWalletClient(...).extend(...)` and an `account` from the private key.

## Open items to confirm during integration
- Confirm `RWADynamicOracle` (or equivalent NAV source) address on Mantle, or use Ondo's Web2 price endpoint as the `NavSource`.
- Confirm the USDY/safe DEX pool address + its interface (UniV2 `getReserves` vs LB/V3) for the price + liquidity adapters.
- Confirm whether a Pyth/RedStone USDY feed exists on Mantle for the cross-check; if not, run with a single price source (`oracleDivergenceBps` stays 0 and the untrusted-data guard is effectively disabled — note this in the agent config).
- viem `writeContract` needs an `account`; the real wallet client supplies it. The `WriteClient` interface here omits it intentionally (the bound wallet client carries the account).

---

## Self-Review

**Spec coverage (design §5 data flow, §8 agent, on-chain-enforceable parts of §9):**
- §8 modules: `adapters/` (Task 5), `engine/assessRegime`+`selectAction` (Tasks 3–4), `executor/` (Tasks 7+9), `attestor` (Task 6), `loop` (Task 8). ✓
- §5 data flow: gather signals → assessRegime → selectAction → execute/attest → (vault records attestation). Tasks 5,3,4,8. ✓
- §5 action set: park (CALM), observe (WATCH), early-exit, liquidity-bridge, terminal-exit; protect-failed-illiquid fallback (never dump into empty pool). Task 4. ✓
- §9 fail-safe: untrusted-data → WATCH (Task 3); liquidity-trap → bridge or protect-failed, never sell into illiquidity (Task 4); amountOutMin/borrow sized to satisfy on-chain floor/cap (Task 4). ✓ (NAV staleness + agent-crash restart handled by the integration runner, deferred.)
- Real protocol read-adapters + live loop are explicitly deferred (mirrors Plan 1's "real adapters next" boundary). ✓

**Placeholder scan:** No TBD/TODO in code steps; every step has complete code + exact commands. "Deferred" section lists real follow-up work, not gaps in this plan's deliverable.

**Type consistency:** `ActionType`/`Regime` numeric values mirror Solidity. `Signals`/`AgentPolicy`/`ActionPlan`/`Decision` defined in Task 2 used identically in Tasks 3,4,5,8. `VaultSender`/`ExecuteArgs`/`ObserveArgs` defined in Task 8 and consumed by Task 9's `viemSender`. `encodeActionParams` (Task 7) param shapes match the Solidity `abi.decode` shapes from Plan 1 (verified by the decode round-trip tests). `vaultAbi` function/arg order matches `executeProtectiveAction`/`attestObservation`. `loadConfig` produces the `AgentPolicy` shape from Task 2.
