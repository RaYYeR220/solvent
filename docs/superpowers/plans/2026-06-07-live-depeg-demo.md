# Live Depeg Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recordable demo on a forked Mantle where the Solvent agent reacts to a USDY depeg — **swapping** to safe-asset when the pool is deep enough to exit, and **bridging** (hedge via INIT lending) when it isn't — with the dashboard (fork RPC) reacting live.

**Architecture:** Fork Mantle in anvil. Use the real, thin USDY/USDC Agni pool (no V3 seeding needed) — a swap crashes the price. Deploy a corrected INIT lending adapter (underlying↔inToken + position-read views) and a `SolventVaultV2_1` whose `totalAssets()` values the bridged INIT position. Fund the vault with USDY; the swap-vs-bridge choice is driven by funding size vs pool depth (the agent's real logic). Live mainnet is untouched.

**Tech Stack:** Foundry (Solidity 0.8.24, forge fork tests/scripts), INIT Capital (lending), Agni Finance (Uniswap-V3 fork DEX), the existing TS agent (tsx), Next.js 15 + wagmi/viem dashboard.

---

## Spike findings (verified on-chain 2026-06-07, rpc.mantle.xyz)

- USDT0/USDC fee=100 pool `0x36F665…` — liquidity **0** (USDT0 path dead; demo uses USDY).
- USDY/USDC fee=100 pool `0x9cd55b03c64B65Ba02A1D985Caef63046B2d54eb` — **real but thin** (~$1k). A swap crashes it; **no V3 seeding / NFPM needed**.
- USDY/USDC fee=500 `0xFF7472…` — ~empty. USDY/USDT fee=100 `0xe38E3a…` — ~$900.
- INIT `inUSDY` pool `0xf084813F…` — `underlyingToken()==USDY`, symbol `inUSDY` (collateral side exists).
- INIT `inUSDC` pool `0x00A55649…` — `underlyingToken()==USDC`, `totalAssets ~ $1.2M` (borrow side deep).
- INIT Core `0x972BcB02…`. Current `IInitCore` (in `InitLendingAdapter.sol`) has `createPos/collateralize/decollateralize/borrow/repay` but **NOT** the underlying↔inToken mint/redeem — that ABI is pinned in Task 1.
- Agent `selectAction` (`agent/src/engine/selectAction.ts:23-74`): EARLY/TERMINAL first try `SWAP_TO_SAFE` when `liquidityDepth >= assetBalance`; **BRIDGE_VIA_LENDING is the EARLY-only fallback when depth < balance**; TERMINAL never bridges. So: small vault balance ⇒ swap; balance > pool depth ⇒ bridge.
- Agent hardcodes QUOTER + FEE_TIER (`agent/src/runtime/main.ts:29,52`) — make env-overridable.

## Key addresses (Mantle)

```
USDY              0x5bE26527e817998A7206475496fDE1E68957c5A6  (18 dec)
USDC              0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9  (6 dec)
AGNI_SWAP_ROUTER  0x319B69888b0d11cEC22caA5034e25FfFBDc88421
AGNI_QUOTER_V2    0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
USDY/USDC f100    0x9cd55b03c64B65Ba02A1D985Caef63046B2d54eb
INIT_CORE         0x972BcB0284cca0152527c4f70f8F689852bCAFc5
INIT_LENS         0x7d2b278b8ef87bEb83AeC01243ff2Fed57456042
inUSDY pool       0xf084813F1be067d980a0171F067f084f27B3F63A
inUSDC pool       0x00A55649E597d463fD212fBE48a3B40f0E227d06
ATTESTATION       0x89D3F83B777b245A80baec60277B449B8E72B5D3
AGENT_EOA         0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c   (agentId 106)
```

## File structure

```
contracts/
  test/InitFork.t.sol                      [new] Task 1 — pin INIT ABI + prove USDY-collateral/USDC-borrow on a fork
  src/interfaces/IInitCore.sol             [new] extracted + extended IInitCore (mintTo/burnTo + reads, confirmed in Task 1)
  src/adapters/InitLendingAdapterV2.sol    [new] underlying↔inToken adapter + collateral/debt views
  test/InitLendingAdapterV2.fork.t.sol     [new] fork test of the adapter via ILendingVenue surface
  src/SolventVaultV2_1.sol                 [new] = V2 + INIT-aware totalAssets()
  test/SolventVaultV2_1.t.sol              [new] totalAssets-under-bridge unit tests (mock venue w/ views)
  script/MantleAddresses.sol               [modify] add USDY/USDC f100 pool const
  script/SetupDemoFork.s.sol               [new] deploy V2.1 + adapter, wire policy, deal USDY, deposit
  script/ManualDepegFork.s.sol             [new] depeg / repeg swaps (transient|terminal)
agent/
  src/runtime/main.ts                      [modify] env overrides QUOTER_ADDRESS, FEE_TIER
  .env.fork.example                        [new] demo env template (USDY, fork RPC, ALLOWED_ACTIONS=14, short poll)
web/
  src/lib/hooks/useVaultMode.ts            [new] read INIT position → DIRECT|BRIDGED + breakdown
  src/components/VaultModeIndicator.tsx    [new] small indicator
  src/app/app/page.tsx                     [modify] mount the indicator
docs/
  demo-live-depeg.md                       [new] command-by-command runbook (both scenarios)
```

## Build order (safety-floor + riskiest-first)

Phase 1 = a guaranteed working **swap** demo (no contract changes, no INIT). Phase 2 pins INIT. Phases 3-5 add the **bridge** scenario. Phase 6 = agent/dashboard/runbook polish. Each phase ends green and demoable.

---

## Phase 1 — Swap scenario floor (USDY vault on fork, no INIT)

### Task 1.0: Add the USDY/USDC pool constant

**Files:** Modify `contracts/script/MantleAddresses.sol`

- [ ] Add under the DEX section:
```solidity
address internal constant AGNI_USDY_USDC_POOL_F100 = 0x9cd55b03c64B65Ba02A1D985Caef63046B2d54eb;
```
- [ ] `forge build` — expect compile OK.
- [ ] Commit: `git add -A && git commit -m "chore(contracts): add USDY/USDC f100 pool address"`

### Task 1.1: Fork setup script (swap-ready)

**Files:** Create `contracts/script/SetupDemoFork.s.sol`

Deploys a fresh `AgniDexAdapter(fee=100)`, deploys `SolventVaultV2` (the existing V2 is fine for the swap floor; V2.1 swapped in at Phase 5), wires it, deals USDY to a demo depositor, deposits a **small** balance (≤ pool depth) so the agent will SWAP.

- [ ] Write the script:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {AgniDexAdapter} from "../src/adapters/AgniDexAdapter.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice One-shot fork bootstrap. Run against anvil --fork-url <mantle>.
/// Deploys a USDY vault + fee=100 Agni adapter, funds a depositor, deposits.
/// DEMO_DEPOSIT (USDY, 18dec) controls swap-vs-bridge: small => swap.
contract SetupDemoFork is Script {
    address constant ATTESTATION = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
    address constant AGENT_EOA   = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
    uint256 constant AGENT_ID    = 106;

    function run() external {
        address owner    = vm.envAddress("DEPLOYER_ADDRESS");      // anvil acct 0
        address depositor= vm.envOr("DEMO_DEPOSITOR", owner);
        uint256 depUSDY  = vm.envOr("DEMO_DEPOSIT", uint256(100 ether)); // 100 USDY (<= pool depth => swap)

        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: MantleAddresses.USDC,
            bridgeVenue: address(0),
            maxBridgeLTVBps: 0,
            allowedActions: uint32(1) << uint8(ActionType.SWAP_TO_SAFE)
        });

        vm.startBroadcast();
        AgniDexAdapter adapter = new AgniDexAdapter(
            MantleAddresses.AGNI_SWAP_ROUTER, MantleAddresses.AGNI_QUOTER_V2, 100
        );
        SolventVaultV2 v = new SolventVaultV2(
            MantleAddresses.USDY, owner, AGENT_EOA, AGENT_ID, ATTESTATION, policy
        );
        v.setDexRouter(address(adapter));
        vm.stopBroadcast();

        // Fund depositor with USDY and deposit into the vault.
        deal(MantleAddresses.USDY, depositor, depUSDY);
        vm.startBroadcast(depositor);
        IERC20(MantleAddresses.USDY).approve(address(v), depUSDY);
        v.deposit(depUSDY, depositor);
        vm.stopBroadcast();

        console.log("VAULT", address(v));
        console.log("ADAPTER", address(adapter));
    }
}
```
- [ ] `forge build` — expect OK. (Note: `deal` is a forge-std cheatcode; in a script it requires running with `--fork-url`; it works in `vm` scripts on anvil. If `deal` on USDY fails (non-standard storage), Task 1.2 documents the whale-impersonation fallback.)
- [ ] Commit: `git commit -am "feat(contracts): SetupDemoFork script (USDY vault + f100 adapter, swap-ready)"`

### Task 1.2: Smoke-test the fork bootstrap

**Files:** none (manual run + a runbook stub)

- [ ] Start a fork: `anvil --fork-url https://rpc.mantle.xyz --chain-id 5000` (background).
- [ ] Run setup (acct0 key is anvil default `0xac09…ff80`):
```bash
cd contracts
DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
forge script script/SetupDemoFork.s.sol --rpc-url http://localhost:8545 \
  --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```
Expected: prints VAULT + ADAPTER addresses; no revert.
- [ ] If `deal` on USDY reverts: replace with whale impersonation in the script — find a USDY holder (`cast call USDY balanceOf <whale>`) and `vm.prank(whale); IERC20(USDY).transfer(depositor, amount);`. Document the chosen approach inline.
- [ ] `cast call <VAULT> "totalAssets()(uint256)" --rpc-url http://localhost:8545` — expect ≈ depUSDY.
- [ ] Commit a runbook stub: create `docs/demo-live-depeg.md` with the anvil + setup commands so far. `git add docs/demo-live-depeg.md && git commit -m "docs: demo runbook (fork bootstrap)"`

### Task 1.3: Agent env overrides for QUOTER + FEE_TIER

**Files:** Modify `agent/src/runtime/main.ts:29,52`; Create `agent/.env.fork.example`

- [ ] In `main.ts`, change the hardcoded constants to env-overridable:
```typescript
const QUOTER: Address = (process.env.QUOTER_ADDRESS ?? "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb") as Address;
```
and where `const FEE_TIER = 100;` is set:
```typescript
const FEE_TIER = process.env.FEE_TIER ? parseInt(process.env.FEE_TIER, 10) : 100;
```
- [ ] Create `agent/.env.fork.example`:
```
MANTLE_RPC_URL=http://localhost:8545
VAULT_ADDRESS=<paste fork vault from SetupDemoFork>
AGENT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT_ID=106
ASSET_ADDRESS=0x5bE26527e817998A7206475496fDE1E68957c5A6
SAFE_ASSET_ADDRESS=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
QUOTER_ADDRESS=0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
FEE_TIER=100
ALLOWED_ACTIONS=2
POLL_INTERVAL_MS=6000
LIQUIDITY_PROBE_SIZES=10000000000000000000,100000000000000000000,1000000000000000000000
WATCH_DIVERGENCE_BPS=20
EARLY_DIVERGENCE_BPS=50
TERMINAL_DIVERGENCE_BPS=500
MAX_ORACLE_DIVERGENCE_BPS=10000
```
(`ALLOWED_ACTIONS=2` = `1<<SWAP_TO_SAFE` = SWAP-only for Phase 1, matching live; Phase 5 uses `14` for swap|bridge|unwind. Probe sizes in USDY 18-dec.)
- [ ] `cd agent && npm run build` (or `npx tsc --noEmit`) — expect clean.
- [ ] Commit: `git commit -am "feat(agent): env-overridable QUOTER_ADDRESS + FEE_TIER for fork demo"`

### Task 1.4: ManualDepegFork script (terminal swap trigger)

**Files:** Create `contracts/script/ManualDepegFork.s.sol`

Crashes the USDY/USDC f100 pool by swapping USDY→USDC through the router. `MODE=terminal` swaps hard (below term_trig); `MODE=transient` swaps moderately (into EARLY band); `MODE=repeg` swaps USDC→USDY to restore.

- [ ] Write the script (uses the Agni router `exactInputSingle`; deal the swapper its input token):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MantleAddresses} from "./MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAgniRouter {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256);
}

/// @notice Push the USDY/USDC f100 price down (depeg) or back up (repeg) on a fork.
/// MODE: terminal | transient | repeg. AMOUNT overrides the default size.
contract ManualDepegFork is Script {
    function run() external {
        string memory mode = vm.envOr("MODE", string("terminal"));
        address swapper = vm.envAddress("DEPLOYER_ADDRESS");
        IAgniRouter router = IAgniRouter(MantleAddresses.AGNI_SWAP_ROUTER);

        bool repeg = keccak256(bytes(mode)) == keccak256("repeg");
        address tokenIn  = repeg ? MantleAddresses.USDC : MantleAddresses.USDY;
        address tokenOut = repeg ? MantleAddresses.USDY : MantleAddresses.USDC;

        // Defaults sized against the ~$1k pool: transient = mild, terminal = hard.
        uint256 def = repeg ? 2000e6
            : keccak256(bytes(mode)) == keccak256("transient") ? 300 ether : 5000 ether;
        uint256 amountIn = vm.envOr("AMOUNT", def);

        deal(tokenIn, swapper, amountIn);
        vm.startBroadcast(swapper);
        IERC20(tokenIn).approve(address(router), amountIn);
        uint256 out = router.exactInputSingle(IAgniRouter.ExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, fee: 100, recipient: swapper,
            deadline: block.timestamp + 600, amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }));
        vm.stopBroadcast();
        console.log("mode", mode);
        console.log("amountIn", amountIn);
        console.log("amountOut", out);
    }
}
```
- [ ] `forge build` — expect OK.
- [ ] Commit: `git commit -am "feat(contracts): ManualDepegFork (depeg/repeg swap trigger)"`

### Task 1.5: End-to-end swap scenario (manual verification)

**Files:** append to `docs/demo-live-depeg.md`

- [ ] With the fork + vault from Task 1.2 running, copy the vault addr into `agent/.env.fork`. Run agent once BEFORE depeg: `cd agent && cp .env.fork.example .env.fork` (edit VAULT), then `node --env-file=.env.fork ... ` or `MANTLE_RPC_URL=... npx tsx src/runtime/main.ts --once`. Expect regime CALM, action NONE (attestObservation).
- [ ] Trigger depeg: `cd contracts && MODE=terminal DEPLOYER_ADDRESS=0xf39F… forge script script/ManualDepegFork.s.sol --rpc-url http://localhost:8545 --broadcast --unlocked --sender 0xf39F…`
- [ ] Run agent once: expect regime TERMINAL_DEPEG, action SWAP_TO_SAFE, a successful `executeProtectiveAction` tx.
- [ ] `cast call <VAULT> "totalAssets()(uint256)"` — value roughly preserved (now in USDC). Vault USDY balance ≈ 0, USDC balance > 0.
- [ ] Document the exact commands in the runbook. Commit: `git commit -am "docs: swap scenario runbook (verified on fork)"`

**Phase 1 gate:** the swap demo runs end-to-end on a fork. This is the guaranteed-deliverable floor.

---

## Phase 2 — Pin INIT integration on a fork (spike → tests)

### Task 2.1: INIT fork spike — prove USDY-collateral / USDC-borrow + pin the ABI

**Files:** Create `contracts/test/InitFork.t.sol`

Goal: a forge **fork test** that, acting as a fresh account, deposits USDY into INIT (mint inUSDY), creates a position, collateralizes, borrows USDC, reads back collateral & debt, then repays + withdraws. This proves feasibility and **pins the exact INIT Core mint/redeem + read ABI** (which is not in the repo). Use Mantlescan's verified INIT Core ABI to fill the unknown selectors; the test is the source of truth.

- [ ] Scaffold the test with the KNOWN INIT Core methods and the candidate mint/redeem/read methods to confirm:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IInitCoreFull {
    function createPos(uint16 mode, address viewer) external returns (uint256 posId);
    function mintTo(address pool, address to) external returns (uint256 shares);   // confirm selector
    function burnTo(address pool, address to) external returns (uint256 amt);      // confirm selector
    function collateralize(uint256 posId, address pool, uint256 amt) external;
    function decollateralize(uint256 posId, address pool, uint256 shares, address to) external;
    function borrow(uint256 posId, address pool, uint256 amt) external returns (uint256);
    function repay(uint256 posId, address pool, uint256 shares) external returns (uint256);
    function getPosCollInfo(uint256 posId) external view returns (address[] memory pools, uint256[] memory amts); // confirm
    function getPosBorrInfo(uint256 posId) external view returns (address[] memory pools, uint256[] memory debts); // confirm
}
interface IInitPool { function underlyingToken() external view returns (address); function toAmt(uint256 shares) external view returns (uint256); }

contract InitForkTest is Test {
    address constant CORE = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5;
    address constant INUSDY = 0xf084813F1be067d980a0171F067f084f27B3F63A;
    address constant INUSDC = 0x00A55649E597d463fD212fBE48a3B40f0E227d06;
    address constant USDY = 0x5bE26527e817998A7206475496fDE1E68957c5A6;
    address constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9;

    function setUp() public { vm.createSelectFork("https://rpc.mantle.xyz"); }

    function test_init_usdy_collateral_usdc_borrow_roundtrip() public {
        IInitCoreFull core = IInitCoreFull(CORE);
        deal(USDY, address(this), 1000 ether);

        // 1) underlying USDY -> inUSDY shares
        IERC20(USDY).transfer(INUSDY, 1000 ether);
        uint256 shares = core.mintTo(INUSDY, address(this));
        assertGt(shares, 0, "mint inUSDY");

        // 2) position + collateralize
        uint256 pos = core.createPos(1, address(this));
        IERC20(INUSDY).approve(CORE, shares);
        core.collateralize(pos, INUSDY, shares);

        // 3) borrow USDC (inUSDC shares -> redeem to USDC)
        uint256 borrowShares = core.borrow(pos, INUSDC, /*amount in inUSDC*/ 0); // size in Task; assert USDC received
        // ... redeem inUSDC -> USDC via burnTo; assert balance up
        // 4) read collateral & debt; assert sane
        // 5) repay + decollateralize; assert position cleared
    }
}
```
- [ ] Run: `cd contracts && forge test --match-path test/InitFork.t.sol -vvv`. Iterate on the unknown selectors (mintTo/burnTo/getPos* names) until green. **If INIT rejects USDY as collateral (LTV 0 / not listed) → STOP and report to the user** (this would block the bridge; fallback options: different INIT-collateral RWA, or de-scope to swap-only). The verified INIT Core ABI is on Mantlescan at `0x972BcB02…`.
- [ ] Once green, record the confirmed ABI + the collateral/debt read path in a comment block at the top of the test (it feeds Tasks 2.2 and 3.x).
- [ ] Commit: `git commit -am "test(contracts): INIT fork spike — USDY collateral / USDC borrow proven; ABI pinned"`

### Task 2.2: Extract confirmed `IInitCore`

**Files:** Create `contracts/src/interfaces/IInitCore.sol`

- [ ] Move the **confirmed** interface (from Task 2.1) here, including mint/redeem and the collateral/debt read methods. Keep `InitLendingAdapter.sol`'s inline `IInitCore` for backward compat or switch it to import this. `forge build` clean.
- [ ] Commit: `git commit -am "refactor(contracts): IInitCore interface (confirmed against fork)"`

---

## Phase 3 — Corrected INIT adapter (underlying↔inToken + views)

### Task 3.1: `InitLendingAdapterV2` — TDD via fork test

**Files:** Create `contracts/src/adapters/InitLendingAdapterV2.sol`, `contracts/test/InitLendingAdapterV2.fork.t.sol`

The vault calls `venue.supply(asset()=USDY, amount, this)` / `venue.borrow(safeAsset=USDC, amount, this)` etc. The adapter must accept the **underlying** and internally mint/redeem inTokens. It must expose views the vault's `totalAssets()` will read.

- [ ] Write the fork test first (`InitLendingAdapterV2.fork.t.sol`): deploy `InitLendingAdapterV2(CORE, INUSDY, INUSDC, USDY, USDC)`; as a caller, `supply(USDY, 500e18, caller)`, assert `collateralUnderlying() ≈ 500e18`; `borrow(USDC, X, caller)`, assert caller received X USDC and `debtUnderlying() ≈ X`; `repay(USDC, X, caller)` + `withdraw(USDY, 500e18, caller)`, assert position cleared and USDY returned. Run: `forge test --match-path test/InitLendingAdapterV2.fork.t.sol -vvv` — expect FAIL (no contract).
- [ ] Implement `InitLendingAdapterV2` implementing `ILendingVenue` + adding `collateralUnderlying()`/`debtUnderlying()` views, using the confirmed `IInitCore` (mintTo/borrow/burnTo/repay/decollateralize/getPos* from Task 2.x). `supply`: pull USDY → transfer to inUSDY pool → `core.mintTo(inUSDY,this)` → `createPos`/`collateralize`. `borrow`: `core.borrow(pos, inUSDC, shares)` → `burnTo(inUSDC, this)` → transfer USDC to caller. `repay`/`withdraw` reverse. Views read `getPos*` + `IInitPool.toAmt`.
- [ ] Run the fork test — iterate to green.
- [ ] Commit: `git commit -am "feat(contracts): InitLendingAdapterV2 (underlying<->inToken + collateral/debt views), fork-tested"`

---

## Phase 4 — `SolventVaultV2_1` with INIT-aware totalAssets

### Task 4.1: Mock-venue unit tests for totalAssets under bridge

**Files:** Create `contracts/test/SolventVaultV2_1.t.sol`

- [ ] Write a `MockLendingVenue` (implements `ILendingVenue` + `collateralUnderlying()/debtUnderlying()`) and tests asserting: after `BRIDGE_VIA_LENDING(collateral C, borrow B)`, `totalAssets()` == initial (within rounding): `assetBal(−C) + safeBalAsAsset(+B) + collateralUnderlying(+C) − debtUnderlying(−B)`; and share price unchanged across bridge→unwind. Run — expect FAIL.

### Task 4.2: Implement `SolventVaultV2_1`

**Files:** Create `contracts/src/SolventVaultV2_1.sol`

- [ ] Copy `SolventVaultV2.sol`; rename contract; override `totalAssets()`:
```solidity
function totalAssets() public view override returns (uint256) {
    uint256 assetBal = IERC20(asset()).balanceOf(address(this));
    uint256 safeBal  = IERC20(policy.safeAsset).balanceOf(address(this));
    uint8 ad = IERC20Metadata(asset()).decimals();
    uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
    uint256 safeInAsset = (safeBal * (10 ** ad)) / (10 ** sd);
    uint256 coll; uint256 debtInAsset;
    if (policy.bridgeVenue != address(0)) {
        ILendingViews v = ILendingViews(policy.bridgeVenue);
        coll = v.collateralUnderlying();                                   // already in asset units (USDY 18dec)
        debtInAsset = (v.debtUnderlying() * (10 ** ad)) / (10 ** sd);      // USDC(6) -> asset units
    }
    uint256 gross = assetBal + safeInAsset + coll;
    return gross > debtInAsset ? gross - debtInAsset : 0;
}
```
(Add `interface ILendingViews { function collateralUnderlying() external view returns (uint256); function debtUnderlying() external view returns (uint256); }` or extend `ILendingVenue`.)
- [ ] Run Task 4.1 tests — iterate to green. Run the full contracts suite `forge test` — expect all green (existing + new).
- [ ] Commit: `git commit -am "feat(contracts): SolventVaultV2_1 — INIT-aware totalAssets, tests green"`

---

## Phase 5 — Bridge scenario wiring (fork)

### Task 5.1: Extend SetupDemoFork to V2.1 + bridge-enabled policy

**Files:** Modify `contracts/script/SetupDemoFork.s.sol`

- [ ] Swap `SolventVaultV2` → `SolventVaultV2_1`; deploy `InitLendingAdapterV2`; set policy `bridgeVenue=address(initAdapter)`, `maxBridgeLTVBps=5000` (50%), `allowedActions = SWAP|BRIDGE|UNWIND` = `(1<<1)|(1<<2)|(1<<3) = 14`; `vault.setPolicy(...)`. Keep `DEMO_DEPOSIT` env: small ⇒ swap, large (> pool depth, e.g. `5000 ether`) ⇒ bridge.
- [ ] `forge build`; re-run Task 1.2 smoke (small deposit) — still swaps. Commit.

### Task 5.2: Bridge scenario end-to-end (fork)

**Files:** append `docs/demo-live-depeg.md`

- [ ] Re-run setup with `DEMO_DEPOSIT=5000 ether` (exceeds ~$1k pool depth) and `ALLOWED_ACTIONS=14` in the agent env.
- [ ] `MODE=transient` depeg → run agent once → expect regime EARLY_DEPEG, depth < balance → action **BRIDGE_VIA_LENDING**; `cast call <VAULT> "totalAssets()(uint256)"` ≈ preserved (collateral+borrow net). Confirm INIT position via the adapter views.
- [ ] `MODE=repeg` → run agent once → expect **UNWIND_BRIDGE** → back to USDY.
- [ ] Document exact commands. Commit: `git commit -am "docs: bridge scenario runbook (verified on fork)"`

---

## Phase 6 — Dashboard vault-mode + final runbook

### Task 6.1: `useVaultMode` hook

**Files:** Create `web/src/lib/hooks/useVaultMode.ts`

- [ ] Read the vault's `policy.bridgeVenue`; if non-zero, read the adapter's `collateralUnderlying()`/`debtUnderlying()`. Return `{ mode: "DIRECT"|"BRIDGED", collateral, debt }`. `tsc --noEmit` clean.
- [ ] Vitest: `web/test/useVaultMode.test.tsx` mocking the reads → asserts mode mapping. Commit.

### Task 6.2: `VaultModeIndicator` + mount

**Files:** Create `web/src/components/VaultModeIndicator.tsx`; modify `web/src/app/app/page.tsx`

- [ ] Small panel: `VAULT MODE: DIRECT` or `VAULT MODE: BRIDGED` + (collateral USDY / borrowed USDC). Mount near `ProtectedPositionStrip`. Vitest render test. `next build` green. Commit.

### Task 6.3: Finalize runbook

**Files:** finalize `docs/demo-live-depeg.md`

- [ ] Full command-by-command for BOTH scenarios: anvil fork → SetupDemoFork (swap / bridge variants) → `web/.env.local` (`NEXT_PUBLIC_MANTLE_RPC=http://localhost:8545`, vault addr) + `npm run dev` → agent `.env.fork` + `--forever` → depeg/repeg triggers. Note recording is the user's. Commit.

---

## Self-review / spec coverage

- Swap scenario ✔ (Phase 1). Bridge+unwind ✔ (Phases 3-5). INIT-aware totalAssets ✔ (Phase 4). Real liquidity (no seed) ✔ (spike). Fork-only / live untouched ✔ (no mainnet tx anywhere). Dashboard bridged indicator ✔ (Phase 6). Agent env overrides ✔ (1.3). Runbook ✔ (1.2/1.5/5.2/6.3).
- **Hard gate:** Task 2.1 — if INIT won't take USDY as collateral, the bridge half is blocked → report to user (swap floor from Phase 1 still ships).
- **Known unknowns pinned by Task 2.1 fork test (not guessed):** INIT mintTo/burnTo selectors, collateral/debt read methods, LTV. The interfaces shown in Tasks 2.x/3.x are candidates the fork test confirms against the verified Mantlescan ABI before dependent code is written.
```
