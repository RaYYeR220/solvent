# Solvent V2 Redesign — Spec

**Date:** 2026-05-30
**Goal:** Convert Solvent from operator-only custody vault into a retail-ready
multi-user product. Drop the onboarding gate, surface a single live dashboard,
let any wallet deposit/withdraw their own funds.

## Why

Plans 1–7 landed a working agent + dashboard but with a custody vault: only
the deployer can deposit, only the deployer can withdraw, the dashboard
hides behind a depositt-gate. Judges and any normal user opening the live
URL see a deposit modal they can't sensibly use.

V2 makes Solvent a real product: ERC-4626 vault, permissionless deposit and
withdrawal, single dashboard view, header + action panel + chart all live at
once. The Verifiable-Guardian thesis (agent decisions visible via ERC-8004)
is unchanged — only the custody model and UI shell change.

## Scope

In scope:
- `SolventVaultV2` rewritten on ERC-4626 (OpenZeppelin base or hand-rolled)
- Foundry test suite for V2 share accounting under agent actions
- Migration: deploy V2 alongside V1 on Mantle mainnet, withdraw V1 funds,
  point agent + dashboard at V2
- Dashboard redesign per the agreed mockup: header (brand · KillSwitch ·
  Agent · Wallet), `protected_position` strip, action panel (deposit/withdraw
  tabs), full-width NAV-vs-MKT chart from NewFeedback history, policy panel,
  decision log, fork-replay placeholder
- Drop `OnboardingFlow` component and `activePreset` state from `/app`

Out of scope:
- Strategy presets (user removed — policy is set by owner once)
- Demo video (deferred to a later task; replay-scrubber stays as placeholder)
- Bridge/Unwind accounting (V2 default policy disables `BRIDGE_VIA_LENDING`
  and `UNWIND_BRIDGE` to avoid INIT collateral + debt edge cases in
  `totalAssets()`)
- Yield-park accounting (similarly excluded from V2 default policy)
- Verifying contract on Mantlescan (separate task, blocked on user API key)
- Ondo USDY swap (still pending allowlist; V2 stays on USDT0)

## Architecture: contract

### SolventVaultV2

**Inheritance:** `ERC4626` (OpenZeppelin v5.x). Asset = USDT0. Shares =
`svUSDT0`. Mints 1:1 on first deposit.

**Retained from V1 verbatim:**
- `Policy` struct, `PolicyLib` enforcement
- `agent`, `agentId`, `attestation`, `killSwitch`, `dexRouter`, `yieldVenue`
- Action surface: `executeProtectiveAction`, `attestObservation`
- Owner setters: `setAgent`, `setPolicy`, `setKillSwitch`, `setDexRouter`,
  `setYieldVenue`
- All internal action impls (`_swapToSafe`, `_bridgeViaLending`,
  `_unwindBridge`, `_parkYield`) — copied byte-for-byte from V1

**Changed from V1:**
- `deposit(uint256, address)` now ERC-4626 standard (any caller mints
  shares to a receiver). Removes `onlyOwner` on deposit.
- `mint`, `withdraw`, `redeem` exposed per ERC-4626 standard. All public.
- New `redeemAll(uint256 shares, address receiver)` non-standard method —
  burns shares, transfers pro-rata mix of `asset` + `policy.safeAsset` to
  receiver. Used by dashboard when vault has executed `SWAP_TO_SAFE` and
  the standard `redeem(asset)` would revert (vault holds USDC, not USDT0).
- New `totalAssets()` override:
  ```solidity
  function totalAssets() public view returns (uint256) {
    uint256 assetBal = asset.balanceOf(address(this));
    uint256 safeBal = IERC20(policy.safeAsset).balanceOf(address(this));
    uint8 ad = IERC20Metadata(address(asset)).decimals();
    uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
    // Nominal 1:1 conversion — same assumption policy.maxSlippageBps floor uses.
    uint256 safeInAssetUnits = (safeBal * (10**ad)) / (10**sd);
    return assetBal + safeInAssetUnits;
  }
  ```
- Removed: V1's `deposit(uint256)`, `withdraw(uint256)`, `withdrawToken`.
  Owner can no longer rug — withdrawals are share-gated.
- New: `rescue(address token, uint256 amount, address to)` — owner-only,
  ONLY callable when `killSwitch == true`. Last-resort escape if shares
  accounting breaks. Documented as emergency-only.

**Invariants V2 must preserve:**
- Agent can only call the action surface; never moves user funds directly
- Kill switch blocks `executeProtectiveAction` (not `attestObservation`)
- Slippage cap, action allowlist, LTV cap enforced exactly as V1
- Withdrawing more than your shares' worth reverts
- Total share supply * pricePerShare ≈ totalAssets (4626 math handles this)

### Default policy for V2 deployment

```
earlyDivergenceBps: 50
terminalDivergenceBps: 500
liquidityFloor: 0
maxSlippageBps: 300
safeAsset: USDC (0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9)
bridgeVenue: 0x0 (BRIDGE disabled in V2)
maxBridgeLTVBps: 0
allowedActions: SWAP_TO_SAFE only (PARK_YIELD also disabled — simplifies totalAssets)
```

Simpler policy = simpler `totalAssets()` accounting = correct shares. Bridge
and yield-park can come back when their accounting is wired into `totalAssets`.

## Architecture: dashboard

Layout (locked from previous mockup):

```
┌─────────────────────────────────────────────────────────────────────┐
│ ◎ SOLVENT                          ● KILLSWITCH: OFF                │
│   DEPEG.GUARDIAN · v2.5.0          ● AGENT: LIVE  · last tick 03:11 │
│                                    ◇ 0xC0FF…ee42  · connect / disc  │
├─────────────────────────────────────────────────────────────────────┤
│                       SECTION A · MAIN VIEW                         │
├─────────────────────────────────────────────────────────────────────┤
│ // protected_position                                               │
│   $1,234.56            1,234.86 USDT0   ·   entry $1   ·   Δ +0.0%  │
│   REGIME:CALM    DIV:0bps    ATTEST:106/106    NAV $1.000  MKT $1.000│
├──────────────────────────────────┬──────────────────────────────────┤
│ // vault_actions       [ EXEC ]  │ // policy_reg          [ CFG ]   │
│ ┌────────┬─────────┐             │ early_trig          50 bps       │
│ │DEPOSIT │WITHDRAW │             │ term_trig          500 bps       │
│ └────────┴─────────┘             │ max_ltv              50%         │
│  amount  [______]   USDT0        │ safe_asset          USDC         │
│  your shares: 0 svUSDT0          │ slippage_cap       300 bps       │
│  allowance: 0 USDT0              │ allow_swap         ✓             │
│  [  APPROVE  ]   [  DEPOSIT  ]   │ allow_bridge       ✗             │
│                                  │ kill_switch        OFF           │
├──────────────────────────────────┴──────────────────────────────────┤
│ // price_nav_feed · last N attestations                 [ CH-A ]    │
│   1.005 ┐                       hover → tooltip:                    │
│         │   NAV ─ MKT             tick #94 · 03:11                  │
│   1.000 ┼──────────────────       regime CALM · div 0bps            │
│         │                         action PARK_YIELD                 │
│   0.995 ┘                         tx 0xab12…                        │
├─────────────────────────────────────────────────────────────────────┤
│ // decision_log · last 5             [ ERC-8004 · 106/106 attested ]│
│ …                                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ // fork_demo · manual depeg on mantle fork              [ ▶ later ] │
│ (placeholder: existing scrubber)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

**Header (`Header.tsx`, new)** — replaces inline header in `page.tsx`. Left:
`BrandMark` + `SOLVENT` + `DEPEG.GUARDIAN · v2.5.0`. Right: three status
rows — KillSwitch dot+state, Agent dot+state+last-tick-time, Wallet
ConnectKit-button-or-address.

**ProtectedPositionStrip (`ProtectedPositionStrip.tsx`, replaces inline
HeroStat block)** — TVL big number + user's share balance in USDT0 (`shares
* pricePerShare`) + entry + Δ + status row. Single line for desktop, wraps
on mobile.

**VaultActions (`VaultActions.tsx`, new)** — tabs `DEPOSIT` / `WITHDRAW`.
Deposit tab: amount input, allowance read, two-button approve→deposit
flow. Withdraw tab: amount input (in USDT0 — converted to shares
internally), `redeem` if vault holds enough asset, fallback to `redeemAll`
warning when vault is in safeAsset. Wallet-not-connected → ConnectKit
button takes the panel.

**ChartPanel (rewritten)** — props now `entries: NewFeedbackEntry[]`. Reads
last N (start with 24) decoded payloads from `useDecisionLog`, plots NAV
(`signals.navPrice`) and MKT (`signals.dexPrice`) as two SVG paths.
Crosshair on mouse-move + tooltip with that tick's regime/action/tx.

**PolicyPanel (extended)** — adds three rows: `allow_swap`, `allow_bridge`,
`kill_switch`. Reads from policy.allowedActions bitmask + vault.killSwitch.

**DecisionLog** — unchanged. Already live.

**ForkReplay** — keep as-is, add caption "Fork-demo video coming — interim
scrubber below".

### Files removed

- `web/src/components/OnboardingFlow.tsx`
- `web/src/components/HeroStat.tsx` (merged into ProtectedPositionStrip)

### Page (`app/app/page.tsx`)

Rewritten — no `showOnboarding`, no `activePreset`, no `deposited` state.
Linear render of Header → divider → ProtectedPositionStrip → grid
(VaultActions | PolicyPanel) → ChartPanel (full width) → DecisionLog →
ForkReplay → Footer.

## Migration plan

1. Owner runs `withdraw(0.3e6)` on V1 vault to refund user's test deposit.
2. Deploy `SolventVaultV2` via Foundry script with V2 default policy.
   `attestation` and `agniDexAdapter` are reused (same instances —
   attestation just gets a new vault calling it; adapter is generic).
3. Set V2 vault as agent in V2 (`setAgent(0x8D8BB...)`).
4. Transfer ERC-8004 Identity NFT? **NO** — agent EOA still owns it; the
   `agentId` is bound to the agent identity, not to the vault. V2 just
   passes the same `agentId=106` to its constructor.
5. Disable V1: `setKillSwitch(true)` on V1, makes it inert.
6. Update `contracts/deployments/mantle-mainnet.json` with V2 addresses
   (V1 kept as `solventVaultV1` for historical reference).
7. Update GH Actions secret `AGENT_VAULT_ADDRESS` to V2.
8. Update Vercel env `NEXT_PUBLIC_VAULT_ADDRESS` to V2.
9. Smoke-test agent tick against V2 (one manual cron run).
10. Smoke-test deposit + withdraw from a fresh wallet on live URL.

## Testing

Foundry (target: ≥15 new tests, total ≈68):
- `test_deposit_mintsCorrectShares`
- `test_deposit_secondDepositorGetsCorrectShares` (1:1 then dilutive after swap)
- `test_withdraw_burnsShares_returnsAsset`
- `test_redeem_burnsShares_returnsAsset`
- `test_redeem_revertsWhenInsufficientAssetBalance`
- `test_redeemAll_returnsProRataMix`
- `test_totalAssets_accountsForSafeBalanceAt1to1`
- `test_executeProtectiveAction_swapToSafe_preservesShareValue` (key
  invariant — shares shouldn't gain or lose value just because vault
  composition changed)
- `test_executeProtectiveAction_killSwitchBlocks`
- `test_executeProtectiveAction_disallowedActionReverts`
- `test_executeProtectiveAction_onlyAgent`
- `test_attestObservation_works_evenWhenKilled`
- `test_setPolicy_onlyOwner`
- `test_rescue_onlyWhenKilled_onlyOwner`
- `test_v1Interface_removedMethods_dontCompile` (sanity — V2 doesn't
  expose `deposit(uint256)` without receiver)

vitest (target: 6 new tests):
- `Header.test.tsx` — renders three status rows; ConnectKit when no wallet
- `ProtectedPositionStrip.test.tsx` — renders TVL + user-balance line
- `VaultActions.test.tsx` — tab switching, amount input, approve flow,
  wallet-connect fallback
- `ChartPanel.test.tsx` — derives series from feedback entries; crosshair
- `PolicyPanel.test.tsx` — renders allow_swap/allow_bridge/kill_switch rows
- `page.test.tsx` — renders all panels without gate; no onboarding visible

## File structure

```
contracts/
  src/SolventVaultV2.sol                 [new]
  test/SolventVaultV2.t.sol              [new]
  script/DeployV2.s.sol                  [new]
  script/MigrateV1ToV2.s.sol             [new] (withdraw V1 + kill switch)
  exports/abis/SolventVaultV2.json       [new — autogen via forge inspect]
  deployments/mantle-mainnet.json        [update — add V2 addrs]

agent/
  src/contracts.ts                       [update — point at V2 ABI/addr]
  .env.example                           [update — VAULT_ADDRESS comment]

web/
  src/components/Header.tsx              [new]
  src/components/ProtectedPositionStrip.tsx  [new]
  src/components/VaultActions.tsx        [new]
  src/components/HeroStat.tsx            [delete]
  src/components/OnboardingFlow.tsx      [delete]
  src/components/ChartPanel.tsx          [rewrite]
  src/components/PolicyPanel.tsx         [extend]
  src/lib/contracts.ts                   [update — V2 addr + ABI]
  src/lib/hooks/useVaultState.ts         [update — reads totalAssets, user shares, killSwitch]
  src/lib/hooks/useDeposit.ts            [update — ERC4626 deposit(amount, receiver)]
  src/lib/hooks/useWithdraw.ts           [new — redeem + redeemAll]
  src/app/app/page.tsx                   [rewrite]
  tests/                                 [new component tests]

docs/
  superpowers/specs/2026-05-30-solvent-v2-redesign-design.md  [this file]
  superpowers/plans/2026-05-30-solvent-v2-redesign.md          [next]
```

## Risk register

- **`totalAssets()` accounting after `SWAP_TO_SAFE`**: V2 invariant is that
  total share value is preserved across a 1:1 nominal swap. If the swap
  actually loses value (slippage), share holders eat the loss pro-rata —
  this is correct ERC-4626 behaviour but worth surfacing in UI ("vault is
  in safe mode, redemptions in USDC").
- **Decimals mismatch USDT0 (6) vs USDC (6)**: identical so `(safeBal *
  10^6) / 10^6 == safeBal`. Sanity-check anyway.
- **Standard ERC-4626 `withdraw` reverts when vault is fully in safe asset**:
  expected behaviour. UI should detect and route user to `redeemAll`.
- **V1 vault still alive**: kill-switched + drained. Possible footgun if
  judges look at V1 address — clearly mark V1 as deprecated in README.
- **Mantlescan verification**: V2 needs verification too; deferred to
  separate task.

## Done criteria

- All Foundry V2 tests green
- All vitest tests green (existing + new component tests)
- `next build` green
- V2 deployed to Mantle mainnet, addresses in `mantle-mainnet.json`
- V1 kill-switched on-chain
- Agent cron pointed at V2 — at least one successful tick attested on V2
- Live URL `https://solvent-three.vercel.app` shows new layout, no
  onboarding gate, deposit + withdraw work end-to-end from a fresh wallet
- README updated to mention V2 and the ERC-4626 model
- `docs/demo-script.md` updated to reference new dashboard sections
