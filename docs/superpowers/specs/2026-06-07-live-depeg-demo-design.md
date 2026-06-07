# Solvent — Live Depeg Demo — Spec

**Date:** 2026-06-07
**Note (2026-06-07):** A fork spike (see the plan) refined this: demo asset
pivoted **USDT0 → USDY** (USDT0 has no INIT market; the empty USDT0/USDC pool
also forced seeding). USDY has both a thin-but-real Agni pool (so **V3 seeding /
NFPM is NOT needed** — a swap crashes the existing pool) and an INIT lending
pool. The current `InitLendingAdapter` is a stub the vault can't call (expects
pool tokens, vault passes underlying) → the plan builds `InitLendingAdapterV2`.
Implementation truth lives in `docs/superpowers/plans/2026-06-07-live-depeg-demo.md`.

**Goal:** A recordable, split-screen demo where the Solvent agent reacts to a
real depeg on a **forked Mantle mainnet** and demonstrates *judgment*: it
**bridges** (hedges via lending) on a transient depeg and **swaps** (full exit)
on a terminal collapse. The dashboard, pointed at the fork RPC, reacts live.

## Why

The headline differentiator (the autonomous agent actually protecting funds)
has never been shown end-to-end. The benchmark scoreboard and the live
attestation feed are proof the agent *runs*, but nobody has seen it *react to a
depeg*. A live, on-a-forked-mainnet demo of the full action surface — bridge on
transient, swap on terminal — is the strongest artifact left before the
2026-06-15 deadline.

## Locked decisions (with user)

1. **Fidelity:** real liquidity on the fork (seed the actual Agni V3 pool, crash
   it with a swap) — not a mock venue.
2. **Exit mechanism:** **both** — the agent chooses. Transient depeg →
   `BRIDGE_VIA_LENDING` (+ `UNWIND_BRIDGE` on recovery); terminal collapse →
   `SWAP_TO_SAFE`. This showcases the agent's regime-based judgment.
3. **Accounting:** ship a **V2.1 vault** with an INIT-aware `totalAssets()` so
   the dashboard reads the bridged position correctly (collateral − debt),
   instead of the V2 `assetBal + safeBal` which undercounts a bridge by ~LTV.
   **Deployed on the fork only** (fork redeploy is free; reusable later if we
   ship to live).
4. **Scope boundary:** **fork-only.** Live mainnet (vault, agent cron) is left
   untouched and stays swap-only. The demo is "the full agent on a forked
   mainnet," framed honestly.
5. **Dashboard:** add a small **VAULT MODE: BRIDGED** indicator + breakdown
   (USDT0 collateral in INIT / USDC borrowed) so a viewer understands the hedge.

## Background facts (verified)

- **V2 vault** `0xDDEd84…7c9f`. `_bridgeViaLending` / `_unwindBridge` are fully
  implemented (`SolventVaultV2.sol:201-229`) but disabled by V2's default policy
  (`bridgeVenue=0x0`, `allowedActions=SWAP only`). `totalAssets()`
  (`:95-104`) = `assetBal + safeBal` — ignores any INIT position.
- **INIT lending exists on Mantle:** `initLendingAdapter
  0x783bC82FE4AFB635De351EEB0D09542D3B09C847`; INIT Core
  `0x972BcB0284cca0152527c4f70f8F689852bCAFc5`; USDT pool `0xAdA66a…`; USDC pool
  `0x00A55649…` (deployments json). Present on a fork.
- **Empty real pool:** USDT0/USDC exists only at fee=100 with ~zero liquidity →
  the agent's QuoterV2 read (fee=100, `agent/src/runtime/main.ts`) falls back to
  par. Vault's on-chain `AgniDexAdapter` is fee=500 (mismatch).
- **Agent:** entrypoint `agent/src/runtime/main.ts` (`--once` / `--forever`);
  config `agent/src/config.ts` reads `MANTLE_RPC_URL`, `VAULT_ADDRESS`,
  `AGENT_PRIVATE_KEY`, `AGENT_ID`. Quoter address + fee tier are **hardcoded**
  in `main.ts` (need env overrides for the fork). Price source
  `agent/src/adapters/AgniPriceSource.ts`.
- **Dashboard RPC:** `NEXT_PUBLIC_MANTLE_RPC` → `web/src/lib/wagmi.ts:5` →
  `http(rpcUrl)`. Repointable at `http://localhost:8545` with no code change.

## Architecture

### Contract: `SolventVaultV2_1` (INIT-aware totalAssets)

- Extends / copies V2; the only behavioral change is `totalAssets()`:
  ```
  totalAssets = assetBal
              + safeBalInAssetUnits
              + initCollateralInAssetUnits     // USDT0 collateral locked in INIT
              - initDebtInAssetUnits            // USDC borrowed from INIT
  ```
  Collateral/debt read via the lending venue (a view on `ILendingVenue` /
  `InitLendingAdapter`, or a direct INIT pool query — TBD in plan; add the view
  to the adapter if absent).
- Invariant preserved: a swap or a bridge at nominal 1:1 does not change share
  value. New tests cover share value across `BRIDGE_VIA_LENDING` then
  `UNWIND_BRIDGE`, and across a price move while bridged.
- Foundry tests (target ≥6 new): bridge accounting, unwind accounting, share
  value preserved across bridge round-trip, totalAssets under a depegged price,
  LTV cap respected, only-agent / killSwitch gates still hold.

### Fork infrastructure (forge scripts)

- `SeedLiquidityFork.s.sol`:
  - Ensure USDT0/USDC fee=100 pool exists + initialized at 1:1 (create via
    factory if needed).
  - `deal()` USDT0 + USDC to an LP account; mint a concentrated V3 position via
    the Agni NonfungiblePositionManager around 1:1 (resolve NFPM address).
  - Deploy a fresh `AgniDexAdapter(fee=100)`; deploy `SolventVaultV2_1` on the
    fork (or reuse via impersonation — plan decides); wire
    `vault.setDexRouter(adapter)`, `vault.setPolicy(bridge-enabled)`.
  - `deal()` USDT0 to a demo depositor and `deposit()` ~10,000 into the vault
    (visible protected position).
- `ManualDepegFork.s.sol` (parameterized):
  - `--mode transient`: swap USDT0→USDC to push price into the EARLY band.
  - `--repeg`: reverse swap to restore ~1:1 (drives the unwind).
  - `--mode terminal`: swap hard to push below term_trig.
  - Depth parameterizable; `amountOutMinimum=0` (demo).

### Agent (fork run)

- Add env overrides: `QUOTER_ADDRESS`, `QUOTER_FEE_TIER` (currently hardcoded in
  `main.ts`), plus existing `MANTLE_RPC_URL`/`VAULT_ADDRESS`. A `.env.fork`
  (gitignored) points at the fork.
- `ALLOWED_ACTIONS` includes SWAP | BRIDGE | UNWIND; short `POLL_INTERVAL_MS`
  (~5–8 s) for snappy reaction; `LIQUIDITY_PROBE_SIZES` set so depth > 0.
- Verify the action-selection logic maps EARLY→BRIDGE and TERMINAL→SWAP (the
  original design intent); fix if it doesn't.

### Dashboard (fork)

- `web/.env.local`: `NEXT_PUBLIC_MANTLE_RPC=http://localhost:8545` +
  `NEXT_PUBLIC_VAULT_ADDRESS` = the fork V2.1 vault.
- New small **vault-mode indicator**: read whether the vault has an open INIT
  position; show `VAULT MODE: BRIDGED` + (collateral USDT0 / borrowed USDC)
  breakdown, else `DIRECT`. Reads INIT position client-side (new hook).

### Runbook: `docs/demo-live-depeg.md`

Exact commands, in order, for each scenario (anvil fork → seed → dashboard env
→ agent `--forever` → depeg trigger → [repeg/unwind] ). Recording is the user's.

## Demo flows

**Transient:** dashboard calm (CALM, USDT0) → run `--mode transient` → agent
(~seconds) → REGIME EARLY → `BRIDGE_VIA_LENDING` → dashboard shows VAULT MODE:
BRIDGED (collateral/borrowed), position value held → run `--repeg` → agent
`UNWIND_BRIDGE` → back to USDT0 with upside intact.

**Terminal:** dashboard calm → run `--mode terminal` → agent → REGIME TERMINAL →
`SWAP_TO_SAFE` → position flips to USDC, value protected, attestation in the
decision log.

## Build order (riskiest + safety-floor first)

1. **Terminal + SWAP scenario, end-to-end** — no contract change; a working
   demo floor if bridge runs into trouble. (Seed pool + adapter + fund + agent +
   dashboard on fork + terminal trigger.)
2. **V3 liquidity seeding** hardened (NFPM mint, tick range, sqrtPriceX96) —
   resolve the fragile part early.
3. **`SolventVaultV2_1`** INIT-aware `totalAssets()` + Foundry tests.
4. **Transient: bridge + unwind** scenario (policy enable, repeg trigger, verify
   agent EARLY→BRIDGE / recovery→UNWIND).
5. Agent env overrides + dashboard vault-mode indicator + `demo-live-depeg.md`.

## Risks / open items (resolve in plan/impl)

- **V3 concentrated-liquidity seeding** is the top risk (NFPM address, token0/1
  ordering, tick range, sqrtPriceX96). If it proves unworkable in a forge
  script, come back to the user (do not silently swap to a mock — user chose
  real liquidity).
- **INIT on fork:** confirm USDT0-collateral / USDC-borrow actually work via the
  adapter (listing, LTV, caps). Identify how to read collateral/debt for
  `totalAssets`.
- **Agent action-selection:** confirm EARLY→BRIDGE, TERMINAL→SWAP exists.
- **`deal()` on USDT0** may need a whale-impersonation fallback if storage is
  non-standard.
- Recording/screen-capture is out of scope (user does it).

## Done criteria

- On a forked Mantle: both scenarios run from the runbook and the dashboard
  (fork RPC) reacts live — transient → BRIDGED then unwound; terminal → swapped.
- `SolventVaultV2_1.totalAssets()` reads the bridged position correctly; new
  Foundry tests green; existing suites still green.
- Agent reacts within ~seconds in `--forever` mode on the fork.
- `docs/demo-live-depeg.md` reproduces both flows command-for-command.
- Live mainnet untouched (no redeploy, no policy change, agent cron unchanged).
