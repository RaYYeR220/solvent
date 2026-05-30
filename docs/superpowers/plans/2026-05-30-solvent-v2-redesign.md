# Solvent V2 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is self-contained — code blocks repeat across tasks rather than referencing other tasks so a fresh subagent can execute one task with no other context.

**Goal:** Convert Solvent from a deployer-only custody vault into a multi-user ERC-4626 product. Drop the onboarding gate, render a single live dashboard, let any wallet deposit and withdraw their own funds. Preserve every Verifiable-Guardian property (agent decisions visible via ERC-8004, on-chain policy enforcement, kill switch).

**Architecture:** New `SolventVaultV2` inherits OpenZeppelin v5 ERC4626 (asset = USDT0, shares = `svUSDT0`). Retains V1's policy struct, agent role, action surface, attestation wiring verbatim. Overrides `totalAssets()` to include the policy safe-asset balance (USDC) at nominal 1:1 — so share price is preserved across a `SWAP_TO_SAFE` action. Adds `redeemAll(shares, receiver)` for the safe-mode withdraw case (mixed asset out). Deploys alongside V1 on Mantle mainnet; V1 stays as deprecated reference. Dashboard rewritten around three components — `Header`, `ProtectedPositionStrip`, `VaultActions` (deposit/withdraw tabs) — plus a chart driven by `useDecisionLog` payloads, an extended `PolicyPanel`, and the existing `DecisionLog` + `ForkReplay`. Onboarding gate and presets removed.

**Tech Stack:** Foundry + Solidity 0.8.24 + OpenZeppelin v5 ERC4626; Next.js 15 + wagmi 2.19 + viem 2.51; ERC-8004 reused.

**Working branch:** `plan-8-v2-redesign` (created from master, merged back via `superpowers:finishing-a-development-branch`).

---

## Pre-implementation context

**Repo state at write time:** master @ `36070a0`. Plans 1–7 merged. 47 vitest tests + 53 Foundry tests green.

**Already deployed on Mantle mainnet** (`contracts/deployments/mantle-mainnet.json`):

| Name | Address |
|---|---|
| SolventVault (V1) | `0x06513470e16a7d6071A12708c38a6fa0ED66469c` |
| SolventAttestation | `0x89D3F83B777b245A80baec60277B449B8E72B5D3` |
| ERC-8004 ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| AgniDexAdapter | `0x24090d62792930Aa34351B8b19850581D48628f9` |
| InitLendingAdapter | `0x783bC82FE4AFB635De351EEB0D09542D3B09C847` |
| USDT0 (vault asset) | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` |
| USDC (safe asset) | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` |
| Agent EOA | `0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c` |
| agentId | 106 |
| Deployer / cold owner | `0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798` |

**OpenZeppelin v5 ERC4626 import:**
`@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol` — already vendored under `contracts/lib/openzeppelin-contracts/`.

**Env vars in cold-key environment:**
- `DEPLOYER_PRIVATE_KEY` — cold key owning V1 vault and signing V2 deploy
- `MANTLE_RPC_URL` — defaults to `https://rpc.mantle.xyz`
- `RISK_ASSET=0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (USDT0)
- `SAFE_ASSET=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` (USDC)

**Default V2 policy** (per spec; intentionally narrower than V1 to keep `totalAssets()` honest):

```
earlyDivergenceBps: 50
terminalDivergenceBps: 500
liquidityFloor: 0
maxSlippageBps: 300
safeAsset: USDC (0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9)
bridgeVenue: address(0)   // BRIDGE disabled
maxBridgeLTVBps: 0
allowedActions: SWAP_TO_SAFE only (1 << 1)
```

`PARK_YIELD` and `BRIDGE_VIA_LENDING` / `UNWIND_BRIDGE` deferred until their accounting is wired into `totalAssets()`. The vault code keeps the internal `_parkYield` / `_bridgeViaLending` / `_unwindBridge` impls byte-for-byte from V1 so re-enabling later is a policy flip; only the default deployment disables them.

**Existing artifacts subagents must not re-discover (just use):**
- `contracts/src/Policy.sol` (struct + `PolicyLib`) — imported unchanged
- `contracts/src/SolventAttestation.sol` — reused unchanged
- `contracts/src/interfaces/IDexRouter.sol`, `ILendingVenue.sol` — reused unchanged
- `contracts/script/MantleAddresses.sol` — reused unchanged
- `contracts/exports/abis/AgniDexAdapter.json`, `SolventAttestation.json` — reused
- Existing dashboard hooks: `useVaultState`, `useDecisionLog`, `useDeposit`, `useOraclePrice`, `useDexPrice`, `usePolicy`
- Existing dashboard components: `BrandMark`, `DashboardFrame`, `Panel`, `Footer`, `ChartPanel`, `PolicyPanel`, `DecisionLog`, `ForkReplay`, `OnboardingFlow` (to delete), `HeroStat` (to delete)
- Foundry + forge-std + OZ v5 already wired in `contracts/lib/`

**User-action gates** (subagents cannot do these — escalate to controller, controller relays to user):
- **T3** — running `forge script ... --broadcast` against Mantle mainnet with the cold deployer key. Subagent prepares the command; controller executes with env vars in hand.
- **T4** — updating the `VAULT_ADDRESS` (or equivalent) GitHub Actions secret in repo settings → done by user via GitHub UI.
- **T5** — updating Vercel env var `NEXT_PUBLIC_VAULT_ADDRESS` to the V2 address. Done by user via Vercel UI.
- **T15** — verifying the live preview end-to-end from a fresh wallet (small deposit + withdraw), then updating Vercel production env to V2 if not already.

**Working dir is Windows PowerShell**; subagent commands use bash-style for what they run (the Bash tool is available). Where a step must run *in PowerShell on the user's machine*, that's called out explicitly.

**The hourly agent cron is live and fuelled.** Don't disturb it without an explicit step (T4 is the one that touches it).

---

## File structure

After this plan, `contracts/` gains:

```
contracts/
├── src/
│   ├── SolventVaultV2.sol                     [new]
├── script/
│   ├── DeployV2.s.sol                         [new]
│   ├── MigrateV1ToV2.s.sol                    [new]
├── test/
│   └── SolventVaultV2.t.sol                   [new]
├── exports/abis/
│   └── SolventVaultV2.json                    [new — autogen via forge inspect]
└── deployments/
    └── mantle-mainnet.json                    [modify — add v2 addresses]
```

And `web/` gains / changes:

```
web/
├── src/
│   ├── components/
│   │   ├── Header.tsx                         [new]
│   │   ├── ProtectedPositionStrip.tsx         [new]
│   │   ├── VaultActions.tsx                   [new]
│   │   ├── HeroStat.tsx                       [delete]
│   │   ├── OnboardingFlow.tsx                 [delete]
│   │   ├── ChartPanel.tsx                     [rewrite — driven by useDecisionLog entries]
│   │   └── PolicyPanel.tsx                    [extend — allow_swap / allow_bridge / kill_switch rows]
│   ├── lib/
│   │   ├── contracts.ts                       [modify — vaultAbi → V2, vault env fallback → V2 addr]
│   │   └── hooks/
│   │       ├── useVaultState.ts               [modify — totalAssets, user share balance, agentLastTick]
│   │       ├── useDeposit.ts                  [modify — ERC4626 deposit(amount, receiver)]
│   │       └── useWithdraw.ts                 [new — redeem + redeemAll]
│   └── app/app/page.tsx                       [rewrite — no onboarding, linear render]
├── test/                                      [new component tests + updates]
└── .env.local.example                         [modify — comment V2]
```

Repo root:

```
README.md                                      [modify — V2 note + new address]
docs/demo-script.md                            [modify — deposit-modal beat → wallet-connect beat]
agent/src/contracts.ts                         [modify — import V2 ABI]
agent/.env.example                             [modify — VAULT_ADDRESS comment notes V2]
```

**Test count target:** ~15 new Foundry tests (53 → ~68), ~6 new vitest tests (47 → ~53). All green pre-merge.

---

## Task 0 — Branch setup

**Files:** none (git only).

- [ ] **Step 0.1: Create plan-8-v2-redesign branch**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git checkout master
git pull origin master
git status
git checkout -b plan-8-v2-redesign
git log -1 --oneline
```

Expected: HEAD at master tip (≥ `36070a0`); new branch checked out; working tree clean.

- [ ] **Step 0.2: Push branch to origin**

```bash
git push -u origin plan-8-v2-redesign
```

Expected: branch tracked; remote URL printed.

---

## Task 1 — SolventVaultV2 contract (TDD)

**Goal:** Build `SolventVaultV2` on top of OZ ERC4626, retaining V1's policy + agent + attestation + action surface verbatim. Override `totalAssets()` to include safe-asset balance at nominal 1:1 so share value is preserved across `SWAP_TO_SAFE`. Add `redeemAll(shares, receiver)` for the mixed-asset redemption path. Drive the build with tests.

**Files:**
- Create: `contracts/src/SolventVaultV2.sol`
- Create: `contracts/test/SolventVaultV2.t.sol`

- [ ] **Step 1.1: Write the first failing test — deposit mints 1:1 shares**

Create `contracts/test/SolventVaultV2.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SolventVaultV2Test is Test {
    SolventVaultV2 vault;
    SolventAttestation att;
    MockERC20 asset;   // USDT0 stand-in (6 dec)
    MockERC20 safe;    // USDC stand-in (6 dec)

    address owner = address(0xA11CE);
    address agent = address(0xA9E7);
    address alice = address(0xA11A);
    address bob   = address(0xB0B);
    uint256 constant AGENT_ID = 106;

    function _policy() internal view returns (Policy memory) {
        return Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: address(safe),
            bridgeVenue: address(0),
            maxBridgeLTVBps: 0,
            allowedActions: uint8(1) << uint8(ActionType.SWAP_TO_SAFE)
        });
    }

    function setUp() public {
        asset = new MockERC20("USDT0", "USDT0", 6);
        safe  = new MockERC20("USDC", "USDC", 6);
        att   = new SolventAttestation(address(0));
        vault = new SolventVaultV2(
            address(asset),
            owner,
            agent,
            AGENT_ID,
            address(att),
            _policy()
        );
    }

    function test_deposit_mintsSharesOneToOne() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        uint256 shares = vault.deposit(100e6, alice);
        vm.stopPrank();

        assertEq(shares, 100e6, "1:1 mint on empty vault");
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.totalAssets(), 100e6);
        assertEq(asset.balanceOf(address(vault)), 100e6);
    }
}
```

- [ ] **Step 1.2: Run the test — expect compile failure**

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: COMPILE FAIL — `SolventVaultV2` doesn't exist yet.

- [ ] **Step 1.3: Implement the V2 skeleton — ERC4626 inheritance + constructor + state**

Create `contracts/src/SolventVaultV2.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Policy, ActionType, Regime, PolicyLib} from "./Policy.sol";
import {SolventAttestation} from "./SolventAttestation.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";
import {ILendingVenue} from "./interfaces/ILendingVenue.sol";

/// @notice ERC-4626 vault for the Solvent depeg-guardian product. Shares
/// (`svUSDT0`) track deposits 1:1 nominally; the agent may execute pre-approved
/// protective actions (SWAP_TO_SAFE etc.) that change the vault composition
/// without changing share value (because `totalAssets()` counts the safe asset
/// at nominal 1:1 — the same assumption `policy.maxSlippageBps` uses).
contract SolventVaultV2 is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PolicyLib for Policy;
    using SafeCast for uint256;

    uint256 public immutable agentId;
    SolventAttestation public immutable attestation;

    address public owner;
    address public agent;
    bool public killSwitch;
    Policy public policy;
    IDexRouter public dexRouter;
    ILendingVenue public yieldVenue;

    error NotOwner();
    error NotAgent();
    error Killed();
    error NotKilled();
    error ActionNotAllowed(ActionType action);
    error ZeroAddress();
    error SlippageFloorBreached();
    error BadSwapPath();
    error BorrowExceedsMaxLTV();

    event AgentChanged(address indexed agent);
    event PolicyChanged();
    event KillSwitchSet(bool active);
    event DexRouterChanged(address indexed router);
    event YieldVenueChanged(address indexed venue);
    event ProtectiveActionExecuted(ActionType indexed action, int256 outcome);
    event Rescued(address indexed token, uint256 amount, address indexed to);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(
        address asset_,
        address owner_,
        address agent_,
        uint256 agentId_,
        address attestation_,
        Policy memory policy_
    )
        ERC20("Solvent svUSDT0", "svUSDT0")
        ERC4626(IERC20(asset_))
    {
        if (owner_ == address(0) || asset_ == address(0) || attestation_ == address(0)) {
            revert ZeroAddress();
        }
        if (policy_.safeAsset == address(0)) revert ZeroAddress();
        owner = owner_;
        agent = agent_;
        agentId = agentId_;
        attestation = SolventAttestation(attestation_);
        policy = policy_;
    }

    // --- ERC4626 overrides ---

    /// @notice Total assets = vault's risk-asset balance + safe-asset balance
    /// at nominal 1:1 (decimal-aware). Preserves share value across a
    /// protective swap, since the safe units received credit the same total.
    function totalAssets() public view override returns (uint256) {
        uint256 assetBal = IERC20(asset()).balanceOf(address(this));
        uint256 safeBal = IERC20(policy.safeAsset).balanceOf(address(this));
        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 safeInAssetUnits = (safeBal * (10 ** ad)) / (10 ** sd);
        return assetBal + safeInAssetUnits;
    }
}
```

- [ ] **Step 1.4: Run the deposit test — expect pass**

```bash
cd contracts && forge test --match-test test_deposit_mintsSharesOneToOne -vv
```

Expected: 1 passing. The implementation is incomplete (no action surface yet) but the deposit path is pure ERC-4626 and works.

- [ ] **Step 1.5: Add the totalAssets / share-value preservation tests**

Append to `contracts/test/SolventVaultV2.t.sol`:

```solidity
    function test_totalAssets_accountsForSafeBalanceAt1to1() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        assertEq(vault.totalAssets(), 100e6);

        // Simulate the vault holding 40 USDC after a partial swap (decimal-aware).
        safe.mint(address(vault), 40e6);
        assertEq(vault.totalAssets(), 140e6, "safe asset counts at nominal 1:1");
    }

    function test_secondDepositorGetsCorrectShares() public {
        asset.mint(alice, 100e6);
        asset.mint(bob,   50e6);

        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        uint256 aliceShares = vault.deposit(100e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        asset.approve(address(vault), 50e6);
        uint256 bobShares = vault.deposit(50e6, bob);
        vm.stopPrank();

        assertEq(aliceShares, 100e6);
        assertEq(bobShares, 50e6, "2nd depositor at same NAV gets 1:1");
        assertEq(vault.totalSupply(), 150e6);
        assertEq(vault.totalAssets(), 150e6);
    }
```

Run:

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: 3 passing.

- [ ] **Step 1.6: Add owner setters + agent role wiring**

Append to `contracts/src/SolventVaultV2.sol` (inside the contract, after `totalAssets()`):

```solidity
    // --- owner setters (mirror V1 surface verbatim) ---

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setPolicy(Policy calldata policy_) external onlyOwner {
        if (policy_.safeAsset == address(0)) revert ZeroAddress();
        policy = policy_;
        emit PolicyChanged();
    }

    function setKillSwitch(bool active) external onlyOwner {
        killSwitch = active;
        emit KillSwitchSet(active);
    }

    function setDexRouter(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        dexRouter = IDexRouter(router);
        emit DexRouterChanged(router);
    }

    function setYieldVenue(address venue) external onlyOwner {
        if (venue == address(0)) revert ZeroAddress();
        yieldVenue = ILendingVenue(venue);
        emit YieldVenueChanged(venue);
    }

    /// @notice Owner transfer. Single-step (matches V1).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
```

- [ ] **Step 1.7: Add owner-only setter tests**

Append to `contracts/test/SolventVaultV2.t.sol`:

```solidity
    function test_setPolicy_onlyOwner() public {
        Policy memory p = _policy();
        p.maxSlippageBps = 200;
        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotOwner.selector);
        vault.setPolicy(p);

        vm.prank(owner);
        vault.setPolicy(p);
        (, , , uint16 cap, , , , ) = _readPolicy();
        assertEq(cap, 200);
    }

    function test_setAgent_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotOwner.selector);
        vault.setAgent(address(0xBEEF));

        vm.prank(owner);
        vault.setAgent(address(0xBEEF));
        assertEq(vault.agent(), address(0xBEEF));
    }

    function test_setKillSwitch_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotOwner.selector);
        vault.setKillSwitch(true);

        vm.prank(owner);
        vault.setKillSwitch(true);
        assertTrue(vault.killSwitch());
    }

    function _readPolicy() internal view returns (
        uint16, uint16, uint128, uint16, address, address, uint16, uint8
    ) {
        (
            uint16 a, uint16 b, uint128 c, uint16 d,
            address e, address f, uint16 g, uint8 h
        ) = vault.policy();
        return (a, b, c, d, e, f, g, h);
    }
```

Run:

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: 6 passing.

- [ ] **Step 1.8: Port the protective-action surface verbatim from V1**

Append to `contracts/src/SolventVaultV2.sol` (after the setters):

```solidity
    // --- agent surface (copied verbatim from V1 — same params, same checks) ---

    function executeProtectiveAction(
        ActionType action,
        bytes calldata params,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        string calldata uri
    ) external onlyAgent nonReentrant {
        if (killSwitch) revert Killed();
        if (!policy.isActionAllowed(action)) revert ActionNotAllowed(action);

        int256 outcome;
        if (action == ActionType.SWAP_TO_SAFE) {
            outcome = _swapToSafe(params);
        } else if (action == ActionType.BRIDGE_VIA_LENDING) {
            outcome = _bridgeViaLending(params);
        } else if (action == ActionType.UNWIND_BRIDGE) {
            outcome = _unwindBridge(params);
        } else if (action == ActionType.PARK_YIELD) {
            outcome = _parkYield(params);
        } else {
            revert ActionNotAllowed(action);
        }

        emit ProtectiveActionExecuted(action, outcome);
        attestation.record(agentId, regime, reasonCode, signalsHash, action, outcome, uri);
    }

    function attestObservation(Regime regime, bytes32 reasonCode, bytes32 signalsHash, string calldata uri)
        external
        onlyAgent
    {
        // Intentionally NOT killSwitch-gated: observations move no funds.
        attestation.record(agentId, regime, reasonCode, signalsHash, ActionType.NONE, 0, uri);
    }

    function _swapToSafe(bytes calldata params) internal returns (int256) {
        (uint256 amountIn, uint256 amountOutMin, address[] memory path) =
            abi.decode(params, (uint256, uint256, address[]));

        if (path.length < 2 || path[0] != asset() || path[path.length - 1] != policy.safeAsset) {
            revert BadSwapPath();
        }
        if (address(dexRouter) == address(0)) revert ZeroAddress();

        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 floor = (amountIn * (10000 - policy.maxSlippageBps) * (10 ** sd)) / (10000 * (10 ** ad));
        if (amountOutMin < floor) revert SlippageFloorBreached();

        IERC20(asset()).forceApprove(address(dexRouter), amountIn);
        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        dexRouter.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);
        uint256 received = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        IERC20(asset()).forceApprove(address(dexRouter), 0);
        return received.toInt256();
    }

    function _bridgeViaLending(bytes calldata params) internal returns (int256) {
        (uint256 collateralAmount, uint256 borrowAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 maxBorrow =
            (collateralAmount * policy.maxBridgeLTVBps * (10 ** sd)) / (10000 * (10 ** ad));
        if (borrowAmount > maxBorrow) revert BorrowExceedsMaxLTV();

        IERC20(asset()).forceApprove(address(venue), collateralAmount);
        venue.supply(asset(), collateralAmount, address(this));
        IERC20(asset()).forceApprove(address(venue), 0);

        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        venue.borrow(policy.safeAsset, borrowAmount, address(this));
        uint256 borrowed = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        return borrowed.toInt256();
    }

    function _unwindBridge(bytes calldata params) internal returns (int256) {
        (uint256 repayAmount, uint256 withdrawAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        IERC20(policy.safeAsset).forceApprove(address(venue), repayAmount);
        venue.repay(policy.safeAsset, repayAmount, address(this));
        IERC20(policy.safeAsset).forceApprove(address(venue), 0);

        uint256 balBefore = IERC20(asset()).balanceOf(address(this));
        venue.withdraw(asset(), withdrawAmount, address(this));
        return (IERC20(asset()).balanceOf(address(this)) - balBefore).toInt256();
    }

    function _parkYield(bytes calldata params) internal returns (int256) {
        uint256 amount = abi.decode(params, (uint256));
        if (address(yieldVenue) == address(0)) revert ZeroAddress();
        uint256 balBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).forceApprove(address(yieldVenue), amount);
        yieldVenue.supply(asset(), amount, address(this));
        IERC20(asset()).forceApprove(address(yieldVenue), 0);
        uint256 supplied = balBefore - IERC20(asset()).balanceOf(address(this));
        return supplied.toInt256();
    }
```

- [ ] **Step 1.9: Add the protective-action tests + share-value preservation invariant**

Append to `contracts/test/SolventVaultV2.t.sol`:

```solidity
    // --- mock DEX for SWAP_TO_SAFE tests ---
    function _seedMockDex() internal returns (MockDexRouter dex) {
        dex = new MockDexRouter();
        safe.mint(address(dex), 1_000_000e6); // pre-fund so it can pay out
        vm.prank(owner);
        vault.setDexRouter(address(dex));
    }

    function test_executeProtectiveAction_swapToSafe_preservesShareValue() public {
        // Alice deposits 100 USDT0.
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6); // 1:1 swap

        // Agent swaps the full balance to safe.
        address[] memory path = new address[](2);
        path[0] = asset(); // helper below
        path[1] = address(safe);
        bytes memory params = abi.encode(uint256(100e6), uint256(99e6), path);

        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE,
            params,
            Regime.EARLY_DEPEG,
            keccak256("early-exit"),
            bytes32(0),
            "data:,test"
        );

        // Vault now holds 0 USDT0 + 100 USDC; totalAssets unchanged because of the 1:1 credit.
        assertEq(IERC20(asset()).balanceOf(address(vault)), 0);
        assertEq(safe.balanceOf(address(vault)), 100e6);
        assertEq(vault.totalAssets(), 100e6);
        // Alice's shares still claim 100 USDT0-equivalent.
        assertEq(vault.convertToAssets(vault.balanceOf(alice)), 100e6);
    }

    function asset() internal view returns (address) {
        return address(vault.asset());
    }

    function test_executeProtectiveAction_killSwitchBlocks() public {
        vm.prank(owner);
        vault.setKillSwitch(true);

        address[] memory path = new address[](2);
        path[0] = asset(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(1e6), uint256(0), path);

        vm.prank(agent);
        vm.expectRevert(SolventVaultV2.Killed.selector);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.CALM, bytes32(0), bytes32(0), ""
        );
    }

    function test_executeProtectiveAction_onlyAgent() public {
        address[] memory path = new address[](2);
        path[0] = asset(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(1e6), uint256(0), path);

        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotAgent.selector);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.CALM, bytes32(0), bytes32(0), ""
        );
    }

    function test_executeProtectiveAction_disallowedActionReverts() public {
        // Default V2 policy disables PARK_YIELD.
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SolventVaultV2.ActionNotAllowed.selector, ActionType.PARK_YIELD));
        vault.executeProtectiveAction(
            ActionType.PARK_YIELD, abi.encode(uint256(1e6)), Regime.CALM, bytes32(0), bytes32(0), ""
        );
    }

    function test_attestObservation_worksEvenWhenKilled() public {
        vm.prank(owner);
        vault.setKillSwitch(true);

        // Should NOT revert — observations are pure logging.
        vm.prank(agent);
        vault.attestObservation(Regime.WATCH, keccak256("observe"), bytes32(0), "");
        assertEq(att.decisionCount(address(vault)), 1);
    }
```

Add a `MockDexRouter` to a new file `contracts/test/mocks/MockDexRouterV2.sol` (or reuse if one exists — check first with `ls contracts/test/mocks/`). If reusing, skip the create step; if creating:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDexRouter} from "../../src/interfaces/IDexRouter.sol";

contract MockDexRouter is IDexRouter {
    uint256 public payoutNumerator = 1e6;
    uint256 public payoutDenominator = 1e6;

    function setRate(uint256 num, uint256 den) external {
        payoutNumerator = num;
        payoutDenominator = den;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * payoutNumerator) / payoutDenominator;
        require(out >= amountOutMin, "MockDexRouter: under min");
        IERC20(path[path.length - 1]).transfer(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}
```

(Verify `contracts/test/mocks/MockERC20.sol` exists too — V1 tests use it. If it doesn't, create a minimal version: `ERC20`-derived contract with a public `mint(to, amount)`.)

Add import at the top of the test file:

```solidity
import {MockDexRouter} from "./mocks/MockDexRouterV2.sol";
```

Run:

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: 11 passing.

- [ ] **Step 1.10: Add `redeem`-path tests (standard ERC-4626)**

Append to `contracts/test/SolventVaultV2.t.sol`:

```solidity
    function test_redeem_burnsShares_returnsAsset() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);

        // Standard redemption: 50 shares -> 50 USDT0 out.
        uint256 assetsOut = vault.redeem(50e6, alice, alice);
        vm.stopPrank();

        assertEq(assetsOut, 50e6);
        assertEq(asset.balanceOf(alice), 50e6);
        assertEq(vault.balanceOf(alice), 50e6);
    }

    function test_redeem_revertsWhenInsufficientAssetBalance() public {
        // Alice deposits then agent swaps the full balance away.
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6);
        address[] memory path = new address[](2);
        path[0] = asset(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(100e6), uint256(99e6), path);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.EARLY_DEPEG,
            keccak256("early-exit"), bytes32(0), ""
        );

        // Standard redeem (asset out) reverts because vault holds zero asset.
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20 transfer failure or ERC4626 max check
        vault.redeem(50e6, alice, alice);
    }
```

Run:

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: 13 passing.

- [ ] **Step 1.11: Add `redeemAll` + `rescue` to the contract**

Append to `contracts/src/SolventVaultV2.sol` (inside the contract, after the agent surface):

```solidity
    // --- redeemAll: pro-rata mix of asset + safe-asset out ---

    /// @notice Non-standard redemption that hands the receiver their pro-rata
    /// share of BOTH the risk asset and the safe asset. Used when the vault is
    /// in safe mode (post-`SWAP_TO_SAFE`) and standard `redeem(asset)` would
    /// revert because the vault holds zero risk asset.
    ///
    /// Burns `shares` from msg.sender, transfers `shares/totalSupply` of each
    /// of (risk-asset balance, safe-asset balance) to `receiver`.
    function redeemAll(uint256 shares, address receiver) external nonReentrant {
        uint256 supply = totalSupply();
        if (shares == 0 || supply == 0) revert ZeroAddress();

        uint256 assetBal = IERC20(asset()).balanceOf(address(this));
        uint256 safeBal  = IERC20(policy.safeAsset).balanceOf(address(this));
        uint256 assetOut = (assetBal * shares) / supply;
        uint256 safeOut  = (safeBal  * shares) / supply;

        _burn(msg.sender, shares);

        if (assetOut > 0) IERC20(asset()).safeTransfer(receiver, assetOut);
        if (safeOut  > 0) IERC20(policy.safeAsset).safeTransfer(receiver, safeOut);
    }

    // --- emergency rescue (owner-only, kill-switch-gated) ---

    /// @notice Last-resort escape if shares accounting breaks. Only callable
    /// when killSwitch == true. Owner withdraws an arbitrary token to an
    /// arbitrary address. NOT for routine use; if the vault is healthy the
    /// owner has no path to user deposits.
    function rescue(address token, uint256 amount, address to) external onlyOwner {
        if (!killSwitch) revert NotKilled();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, amount, to);
    }
```

- [ ] **Step 1.12: Add `redeemAll` + `rescue` tests**

Append to `contracts/test/SolventVaultV2.t.sol`:

```solidity
    function test_redeemAll_returnsProRataMix() public {
        // Alice 100 deposit; agent swaps half to safe.
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6);
        address[] memory path = new address[](2);
        path[0] = asset(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(50e6), uint256(49e6), path);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.EARLY_DEPEG,
            keccak256("early-exit"), bytes32(0), ""
        );

        // Vault now: 50 USDT0 + 50 USDC. Alice redeems half her shares (50e6).
        vm.prank(alice);
        vault.redeemAll(50e6, alice);

        // She gets half of each: 25 USDT0 + 25 USDC.
        assertEq(asset.balanceOf(alice), 25e6);
        assertEq(safe.balanceOf(alice), 25e6);
        assertEq(vault.balanceOf(alice), 50e6);
    }

    function test_rescue_onlyWhenKilled_onlyOwner() public {
        // Seed vault with some token.
        asset.mint(alice, 10e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 10e6);
        vault.deposit(10e6, alice);
        vm.stopPrank();

        // Rescue requires kill switch.
        vm.prank(owner);
        vm.expectRevert(SolventVaultV2.NotKilled.selector);
        vault.rescue(asset(), 1e6, owner);

        vm.prank(owner);
        vault.setKillSwitch(true);

        // Now only owner can rescue.
        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotOwner.selector);
        vault.rescue(asset(), 1e6, address(0xDEAD));

        vm.prank(owner);
        vault.rescue(asset(), 1e6, owner);
        assertEq(asset.balanceOf(owner), 1e6);
    }
```

Run:

```bash
cd contracts && forge test --match-contract SolventVaultV2Test -vv
```

Expected: 15 passing.

- [ ] **Step 1.13: Final full-suite sanity — V1 still green, V2 green**

```bash
cd contracts && forge test
```

Expected: 53 baseline (V1) + 15 new (V2) = 68 passing, 0 failing.

If a V1 test fails because of a shared mock change, that's a regression to fix; do not skip. If `MockERC20` had to be added, every V1 test that imported it should still resolve to the same shape.

- [ ] **Step 1.14: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add contracts/src/SolventVaultV2.sol contracts/test/SolventVaultV2.t.sol contracts/test/mocks/
git commit -m "feat(contracts): SolventVaultV2 — ERC-4626 vault with retained V1 action surface + redeemAll + rescue"
```

---

## Task 2 — Deploy + migration scripts (Foundry)

**Goal:** Two Foundry scripts. `DeployV2.s.sol` deploys V2 with the V2 default policy, wires existing AgniDexAdapter as dexRouter, sets agent EOA, prints addresses. `MigrateV1ToV2.s.sol` is an owner-only multi-step that drains V1 to owner, flips V1 kill switch. A mainnet-fork test verifies both run end-to-end. Also export the V2 ABI.

**Files:**
- Create: `contracts/script/DeployV2.s.sol`
- Create: `contracts/script/MigrateV1ToV2.s.sol`
- Create: `contracts/test/DeployV2Fork.t.sol`
- Create: `contracts/exports/abis/SolventVaultV2.json`

- [ ] **Step 2.1: Write the deploy script**

Create `contracts/script/DeployV2.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";

/// @notice Deploys SolventVaultV2 with the V2 default policy, wires existing
/// adapters, sets the agent EOA, and prints the address. Reuses the already
/// deployed SolventAttestation (V1's instance — it's vault-agnostic).
contract DeployV2 is Script {
    // Deployed in Plan 5; vault-agnostic so V2 can reuse it.
    address constant ATTESTATION = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
    address constant AGNI_DEX_ADAPTER = 0x24090d62792930Aa34351B8b19850581D48628f9;
    address constant AGENT_EOA = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
    uint256 constant AGENT_ID = 106;

    function run() external returns (address vault) {
        address owner = vm.envAddress("DEPLOYER_ADDRESS");
        address riskAsset = vm.envOr("RISK_ASSET", MantleAddresses.USDT0);
        address safeAsset = vm.envOr("SAFE_ASSET", MantleAddresses.USDC);

        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: safeAsset,
            bridgeVenue: address(0),       // BRIDGE disabled in V2
            maxBridgeLTVBps: 0,
            allowedActions: uint8(1) << uint8(ActionType.SWAP_TO_SAFE)
        });

        vm.startBroadcast();

        SolventVaultV2 v = new SolventVaultV2(
            riskAsset,
            owner,
            AGENT_EOA,
            AGENT_ID,
            ATTESTATION,
            policy
        );
        v.setDexRouter(AGNI_DEX_ADAPTER);
        // yieldVenue intentionally left unset: PARK_YIELD is disabled in V2 policy.

        vm.stopBroadcast();

        vault = address(v);
        console.log("SolventVaultV2 deployed at:", vault);
        console.log("  owner:", owner);
        console.log("  agent:", AGENT_EOA);
        console.log("  asset (USDT0):", riskAsset);
        console.log("  safeAsset (USDC):", safeAsset);
        console.log("  attestation:", ATTESTATION);
        console.log("  dexRouter:", AGNI_DEX_ADAPTER);
    }
}
```

- [ ] **Step 2.2: Write the migration script (drain V1 + kill V1)**

Create `contracts/script/MigrateV1ToV2.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISolventVaultV1 {
    function asset() external view returns (address);
    function owner() external view returns (address);
    function killSwitch() external view returns (bool);
    function withdraw(uint256 amount) external;
    function withdrawToken(address token, uint256 amount) external;
    function setKillSwitch(bool active) external;
}

/// @notice Owner-only V1 → V2 migration. Drains any residual asset balance
/// out of V1 back to the owner, then kill-switches V1 so the deprecated
/// instance is inert. New V2 deployment is handled by DeployV2.s.sol — this
/// script does NOT seed V2 with an initial deposit (left for a live test from
/// a fresh wallet so the multi-user flow is exercised end-to-end).
contract MigrateV1ToV2 is Script {
    address constant V1_VAULT = 0x06513470e16a7d6071A12708c38a6fa0ED66469c;

    function run() external {
        vm.startBroadcast();

        ISolventVaultV1 v1 = ISolventVaultV1(V1_VAULT);
        address asset = v1.asset();
        uint256 bal = IERC20(asset).balanceOf(V1_VAULT);
        if (bal > 0) {
            console.log("V1 has residual asset balance:", bal);
            v1.withdraw(bal);
            console.log("  drained to owner");
        } else {
            console.log("V1 has zero asset balance — skipping withdraw");
        }

        if (!v1.killSwitch()) {
            v1.setKillSwitch(true);
            console.log("V1 kill switch set");
        } else {
            console.log("V1 kill switch already on — no-op");
        }

        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2.3: Write the fork integration test**

Create `contracts/test/DeployV2Fork.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "../script/MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Smoke test: deploy V2 on a Mantle mainnet fork, verify policy +
/// agent + adapter wiring read back correctly. Skipped automatically if
/// MANTLE_RPC_URL is not set.
contract DeployV2ForkTest is Test {
    function setUp() public {
        string memory rpc;
        try vm.envString("MANTLE_RPC_URL") returns (string memory r) {
            rpc = r;
        } catch {
            vm.skip(true);
            return;
        }
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
    }

    function test_deployV2_readsBack() public {
        address owner = address(0xC01DC0FFEE);
        address agent = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
        address attestation = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
        address adapter = 0x24090d62792930Aa34351B8b19850581D48628f9;

        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: MantleAddresses.USDC,
            bridgeVenue: address(0),
            maxBridgeLTVBps: 0,
            allowedActions: uint8(1) << uint8(ActionType.SWAP_TO_SAFE)
        });

        vm.startPrank(owner);
        SolventVaultV2 v = new SolventVaultV2(
            MantleAddresses.USDT0,
            owner,
            agent,
            106,
            attestation,
            policy
        );
        v.setDexRouter(adapter);
        vm.stopPrank();

        assertEq(v.asset(), MantleAddresses.USDT0);
        assertEq(v.agent(), agent);
        assertEq(v.agentId(), 106);
        assertEq(v.totalAssets(), 0);
        assertEq(address(v.dexRouter()), adapter);
        (, , , uint16 cap, address safeAsset, , , uint8 allowed) = v.policy();
        assertEq(cap, 300);
        assertEq(safeAsset, MantleAddresses.USDC);
        assertEq(allowed, uint8(1) << uint8(ActionType.SWAP_TO_SAFE));
    }
}
```

- [ ] **Step 2.4: Run the fork test** (subagent: only if MANTLE_RPC_URL is set; otherwise it skips and that's fine)

```bash
cd contracts && MANTLE_RPC_URL=https://rpc.mantle.xyz forge test --match-contract DeployV2ForkTest -vv
```

Expected: 1 passing OR skipped. If neither, debug the fork wiring before proceeding.

- [ ] **Step 2.5: Export the V2 ABI**

```bash
cd contracts && forge build && forge inspect SolventVaultV2 abi > exports/abis/SolventVaultV2.json
ls -la exports/abis/SolventVaultV2.json
```

Expected: a JSON file with the V2 ABI written. Should include `deposit`, `mint`, `withdraw`, `redeem`, `redeemAll`, `totalAssets`, `policy`, `agent`, `agentId`, `killSwitch`, `executeProtectiveAction`, `attestObservation`, `setAgent`, `setPolicy`, `setKillSwitch`, `setDexRouter`, `rescue`, plus standard ERC-20 + ERC-4626.

Sanity check:

```bash
cat contracts/exports/abis/SolventVaultV2.json | head -50
```

- [ ] **Step 2.6: Full suite — no regression**

```bash
cd contracts && forge test
```

Expected: 68 baseline (V1 + V2 from T1) + 1 fork (or skipped) = 69 passing / 0 failing.

- [ ] **Step 2.7: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add contracts/script/DeployV2.s.sol contracts/script/MigrateV1ToV2.s.sol contracts/test/DeployV2Fork.t.sol contracts/exports/abis/SolventVaultV2.json
git commit -m "feat(contracts): DeployV2 + MigrateV1ToV2 scripts + fork test + V2 ABI export"
```

---

## Task 3 — Run migration on Mantle mainnet (USER-ACTION GATE)

**Goal:** Execute the migration + V2 deploy on Mantle mainnet using the cold deployer key. Capture addresses. Verify via `cast call`. Update `mantle-mainnet.json`.

**USER-ACTION GATE:** Subagents WITHOUT access to the cold deployer key MUST stop at this task and mark it BLOCKED. The controller relays to the user, who runs the broadcast commands locally. The subagent prepares the exact command strings; the user (or controller in a privileged Bash call) runs them.

**Files:**
- Modify: `contracts/deployments/mantle-mainnet.json` (add v2 addresses block)

- [ ] **Step 3.1: Pre-flight — verify env**

The user/controller must have these env vars set in the shell where they run the broadcast:

```
DEPLOYER_PRIVATE_KEY=<cold key 0x...>     # owns V1 vault; also signs V2 deploy
DEPLOYER_ADDRESS=0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798
MANTLE_RPC_URL=https://rpc.mantle.xyz
RISK_ASSET=0x779Ded0c9e1022225f8E0630b35a9b54bE713736
SAFE_ASSET=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
```

Verify gas balance:

```bash
cast balance --rpc-url https://rpc.mantle.xyz $DEPLOYER_ADDRESS
```

Expected: ≥ 0.1 MNT.

- [ ] **Step 3.2: Run the V1 → V2 migration broadcast** (USER ACTION)

```bash
cd contracts
forge script script/MigrateV1ToV2.s.sol:MigrateV1ToV2 \
  --broadcast \
  --rpc-url $MANTLE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  -vvv
```

Expected console output: "drained to owner" (or "zero asset balance — skipping") + "V1 kill switch set". Capture both tx hashes from the broadcast log.

Verify V1 is killed:

```bash
cast call 0x06513470e16a7d6071A12708c38a6fa0ED66469c "killSwitch()(bool)" --rpc-url $MANTLE_RPC_URL
```

Expected: `true`.

- [ ] **Step 3.3: Run the V2 deploy broadcast** (USER ACTION)

```bash
cd contracts
forge script script/DeployV2.s.sol:DeployV2 \
  --broadcast \
  --rpc-url $MANTLE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  -vvv
```

Capture the address from the `SolventVaultV2 deployed at: 0x...` line. Call it `V2_ADDRESS`.

Verify policy + wiring:

```bash
cast call $V2_ADDRESS "asset()(address)" --rpc-url $MANTLE_RPC_URL
# Expect: 0x779Ded0c9e1022225f8E0630b35a9b54bE713736

cast call $V2_ADDRESS "agent()(address)" --rpc-url $MANTLE_RPC_URL
# Expect: 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c

cast call $V2_ADDRESS "totalAssets()(uint256)" --rpc-url $MANTLE_RPC_URL
# Expect: 0

cast call $V2_ADDRESS "killSwitch()(bool)" --rpc-url $MANTLE_RPC_URL
# Expect: false

cast call $V2_ADDRESS "policy()(uint16,uint16,uint128,uint16,address,address,uint16,uint8)" --rpc-url $MANTLE_RPC_URL
# Expect:
#  earlyDivergenceBps:    50
#  terminalDivergenceBps: 500
#  liquidityFloor:        0
#  maxSlippageBps:        300
#  safeAsset:             0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
#  bridgeVenue:           0x0000000000000000000000000000000000000000
#  maxBridgeLTVBps:       0
#  allowedActions:        2   (= 1 << 1 = SWAP_TO_SAFE bit)
```

- [ ] **Step 3.4: Update `contracts/deployments/mantle-mainnet.json`**

Read the current file and add a `v2` block alongside the existing fields, preserving V1 as `solventVaultV1` for historical reference:

```jsonc
{
  "chainId": 5000,
  "network": "mantle",
  "deployedAt": "2026-05-29",
  "v2DeployedAt": "2026-05-30",
  "deployer": "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798",
  "agentEOA": "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c",
  // ... existing fields preserved ...
  "addresses": {
    "solventVault": "<V2_ADDRESS from Step 3.3>",
    "solventVaultV1": "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
    "solventAttestation": "0x89D3F83B777b245A80baec60277B449B8E72B5D3",
    "agniDexAdapter": "0x24090d62792930Aa34351B8b19850581D48628f9",
    "initLendingAdapter": "0x783bC82FE4AFB635De351EEB0D09542D3B09C847",
    "agentId": 106,
    "riskAsset": "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    "safeAsset": "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    "riskAssetSymbol": "USDT0",
    "safeAssetSymbol": "USDC"
  },
  "v2": {
    "deployTx": "<tx hash from broadcast log>",
    "migrationTxs": {
      "v1Drain": "<tx hash from Step 3.2 — withdraw call>",
      "v1KillSwitch": "<tx hash from Step 3.2 — setKillSwitch call>"
    },
    "policy": {
      "earlyDivergenceBps": 50,
      "terminalDivergenceBps": 500,
      "liquidityFloor": 0,
      "maxSlippageBps": 300,
      "safeAsset": "USDC",
      "bridgeVenue": "0x0000000000000000000000000000000000000000",
      "maxBridgeLTVBps": 0,
      "allowedActions": "SWAP_TO_SAFE only (bitmask = 2)"
    },
    "notes": "ERC-4626 vault; svUSDT0 shares; reuses SolventAttestation + AgniDexAdapter from V1 deployment. V1 kept as solventVaultV1 (kill-switched + drained)."
  }
}
```

Preserve existing `mantlescanLinks`, `wiring`, `verification`, `ondoAllowlist` fields. Add a V2 MantleScan link:

```jsonc
"mantlescanLinks": {
  "solventVault": "https://mantlescan.xyz/address/<V2_ADDRESS>",
  "solventVaultV1": "https://mantlescan.xyz/address/0x06513470e16a7d6071A12708c38a6fa0ED66469c",
  // ... rest unchanged
}
```

- [ ] **Step 3.5: Commit deployment JSON**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add contracts/deployments/mantle-mainnet.json
git commit -m "chore(deployments): record V2 deploy on Mantle mainnet + V1 migration tx hashes"
```

---

## Task 4 — Agent points at V2

**Goal:** Update agent runtime to import the V2 ABI and use the new vault address. Smoke-test locally. Flag GH secret update as USER-ACTION GATE.

**Files:**
- Modify: `agent/src/contracts.ts`
- Modify: `agent/.env.example`

- [ ] **Step 4.1: Read current `agent/src/contracts.ts` shape**

```bash
cat agent/src/contracts.ts | head -40
```

Identify where the vault ABI is imported. It will be a line like:

```ts
import solventVaultAbi from "../../contracts/exports/abis/SolventVault.json" with { type: "json" };
```

or similar (might be `assert { type: "json" }` instead of `with`).

- [ ] **Step 4.2: Switch the ABI import to V2**

Edit `agent/src/contracts.ts`. Replace the V1 ABI import with the V2 ABI import:

```ts
// before
import solventVaultAbi from "../../contracts/exports/abis/SolventVault.json" with { type: "json" };

// after
import solventVaultAbi from "../../contracts/exports/abis/SolventVaultV2.json" with { type: "json" };
```

Keep the exported variable name `solventVaultAbi` so downstream callers don't change. The agent only calls `executeProtectiveAction` and `attestObservation` on the vault — both signatures are identical between V1 and V2.

- [ ] **Step 4.3: Update `agent/.env.example`**

Find the line that documents `VAULT_ADDRESS` (or `AGENT_VAULT_ADDRESS` — check the actual name with `grep -i vault agent/.env.example`). Update the comment:

```
# Solvent vault address (Mantle mainnet).
# As of 2026-05-30 this is the V2 ERC-4626 vault. V1 kept as deprecated reference
# at 0x06513470e16a7d6071A12708c38a6fa0ED66469c (kill-switched).
VAULT_ADDRESS=<V2_ADDRESS from Task 3>
```

Do NOT commit a `.env` with the real address — the example file is the documentation; the actual address comes from env at runtime.

- [ ] **Step 4.4: Local smoke test — single tick against V2**

Subagent: confirm the env is set for the agent (`agent/.env` populated with V2 address + agent private key). Then:

```bash
cd agent
npm run tick 2>&1 | tail -30
```

Expected: tick completes, `attestObservation` tx hash printed, no errors. If errors mention "policy.allowedActions" or "wrong ABI shape" — re-verify the ABI export from Task 2.5 includes the V2 surface, not V1.

If the agent can't reach Mantle locally (no env vars), skip this step and document the skip in the commit message — the GH Actions cron will run the same code against the real env next hour.

- [ ] **Step 4.5: USER-ACTION GATE — update `VAULT_ADDRESS` secret in GitHub Actions**

STOP. Surface to controller:

> **Action required:** Update the `VAULT_ADDRESS` (or whichever name the workflow uses; check `.github/workflows/agent-tick.yml`) repository secret on GitHub to the V2 address from Task 3 Step 3.3.
>
> Steps:
> 1. Go to `https://github.com/RaYYeR220/solvent/settings/secrets/actions`
> 2. Find the existing `VAULT_ADDRESS` secret
> 3. Click "Update" → paste the V2 address → Save
> 4. (Optional) Manually trigger the agent-tick workflow once to confirm it lands on V2 — Actions tab → agent-tick → "Run workflow"
>
> The next scheduled hourly run will use V2.

Wait for user confirmation before continuing.

- [ ] **Step 4.6: Commit agent ABI swap**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add agent/src/contracts.ts agent/.env.example
git commit -m "feat(agent): switch to SolventVaultV2 ABI; .env.example documents V2 address"
```

---

## Task 5 — Dashboard `contracts.ts` + ABI + Vercel env

**Goal:** Web app picks up the V2 ABI + address. Update env example. USER-ACTION GATE for Vercel env.

**Files:**
- Modify: `web/src/lib/contracts.ts`
- Modify: `web/.env.local.example`
- Copy: `contracts/exports/abis/SolventVaultV2.json` → web import path equivalent (the existing setup imports across the workspace; verify the relative path)

- [ ] **Step 5.1: Confirm how `web/` imports the vault ABI today**

```bash
grep -n "SolventVault" web/src/lib/contracts.ts
```

Expected: a line like `import vaultAbiJson from "../../../contracts/exports/abis/SolventVault.json"`. The relative path `../../../contracts/exports/abis/` reaches across workspaces — works because vitest's vite config + Next.js both honor relative imports out of `web/src`.

- [ ] **Step 5.2: Switch the import to V2 + update fallback address**

Edit `web/src/lib/contracts.ts`. Replace the V1 vault import with the V2 import and update the fallback in `CONTRACTS.vault`:

```ts
// before
import vaultAbiJson from "../../../contracts/exports/abis/SolventVault.json" with { type: "json" };
// ...
vault: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x06513470e16a7d6071A12708c38a6fa0ED66469c") as `0x${string}`,

// after
import vaultAbiJson from "../../../contracts/exports/abis/SolventVaultV2.json" with { type: "json" };
// ...
vault: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "<V2_ADDRESS from Task 3>") as `0x${string}`,
```

If the existing import uses `assert { type: "json" }` instead of `with { type: "json" }`, keep that exact attribute form — don't change unrelated style.

The exported `vaultAbi` constant keeps the same name; downstream hooks won't need to touch their imports.

- [ ] **Step 5.3: Update `web/.env.local.example`**

```
# Public env vars for the dashboard. Vercel injects production values via its UI.
# As of 2026-05-30 this points at SolventVaultV2 (ERC-4626). V1 is at
# 0x06513470e16a7d6071A12708c38a6fa0ED66469c — kept as deprecated reference,
# kill-switched on-chain.
NEXT_PUBLIC_VAULT_ADDRESS=<V2_ADDRESS from Task 3>
# ... other vars unchanged ...
```

- [ ] **Step 5.4: Run the contracts unit test**

```bash
cd web && npx vitest run test/lib/contracts.test.ts
```

Expected: still passes (the test asserts ABI contains certain function names — V2 ABI contains all of `totalAssets`, `agent`, `policy`, `deposit`, etc.).

- [ ] **Step 5.5: USER-ACTION GATE — update `NEXT_PUBLIC_VAULT_ADDRESS` on Vercel**

STOP. Surface to controller:

> **Action required:** Update the `NEXT_PUBLIC_VAULT_ADDRESS` env var on the Vercel project (preview + production) to the V2 address from Task 3 Step 3.3.
>
> Steps:
> 1. Go to `https://vercel.com/<org>/solvent/settings/environment-variables`
> 2. Find `NEXT_PUBLIC_VAULT_ADDRESS`
> 3. Edit → paste V2 address → save for both Preview and Production
> 4. The next push to `plan-8-v2-redesign` will trigger a preview deploy that picks up the new var
>
> If we only update Preview now, Production keeps reading V1 (the fallback in `contracts.ts` is V2 after this task, so even without the env override it'd work, but the env-var path is the canonical signal).

Wait for confirmation, but proceed with subsequent tasks — the env var only affects deployed builds, not local dev or tests.

- [ ] **Step 5.6: Commit web ABI swap**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/lib/contracts.ts web/.env.local.example
git commit -m "feat(web): switch dashboard to SolventVaultV2 ABI + V2 fallback address"
```

---

## Task 6 — `useVaultState` extended

**Goal:** Hook reads `totalAssets()` from V2, user share balance via `balanceOf(connectedAddress)`, derives `agentLastTick` from the most recent `NewFeedback` event timestamp.

**Files:**
- Modify: `web/src/lib/hooks/useVaultState.ts`
- Modify: `web/test/lib/hooks/useVaultState.test.ts`

- [ ] **Step 6.1: Extend the return type and reads**

Replace `web/src/lib/hooks/useVaultState.ts` with:

```ts
"use client";

import { useReadContracts, useReadContract, useAccount } from "wagmi";
import { CONTRACTS, vaultAbi, erc20Abi } from "../contracts";
import type { Address } from "viem";

export interface VaultStateLive {
  asset: Address;
  agent: Address;
  agentId: bigint;
  owner: Address;
  killSwitch: boolean;
  /** Vault's total asset value (risk + safe at 1:1), in asset-decimal units. */
  totalAssets: bigint;
  /** Vault's raw risk-asset balance, asset-decimal units. */
  riskAssetBalance: bigint;
  /** Vault's raw safe-asset balance, safe-decimal units. */
  safeAssetBalance: bigint;
  /** Connected wallet's share balance (svUSDT0), share-decimal units. */
  userShares: bigint;
  /** Truncated vault address suitable for display. */
  address: string;
  /** Unix seconds of the last attestation tx — derived in DashboardPage from useDecisionLog, NOT here. */
  isLoading: boolean;
  isError: boolean;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function useVaultState(): VaultStateLive {
  const { address: connected } = useAccount();

  const batch = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "asset" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agent" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agentId" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "owner" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "killSwitch" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "totalAssets" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const riskBal = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const safeBal = useReadContract({
    address: CONTRACTS.safeAsset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const userShareBal = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: connected ? [connected] : undefined,
    query: { enabled: !!connected, refetchInterval: 12_000 },
  });

  const r = batch.data;
  return {
    asset: (r?.[0]?.result as Address | undefined) ?? CONTRACTS.asset,
    agent: (r?.[1]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    agentId: (r?.[2]?.result as bigint | undefined) ?? CONTRACTS.agentId,
    owner: (r?.[3]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    killSwitch: Boolean(r?.[4]?.result ?? false),
    totalAssets: (r?.[5]?.result as bigint | undefined) ?? BigInt(0),
    riskAssetBalance: (riskBal.data as bigint | undefined) ?? BigInt(0),
    safeAssetBalance: (safeBal.data as bigint | undefined) ?? BigInt(0),
    userShares: (userShareBal.data as bigint | undefined) ?? BigInt(0),
    address: shortAddr(CONTRACTS.vault),
    isLoading: batch.isLoading || riskBal.isLoading || safeBal.isLoading,
    isError: batch.isError || riskBal.isError || safeBal.isError,
  };
}
```

Notes:
- The legacy `assetBalance` field is renamed to `riskAssetBalance`. The page (Task 14) consumes the new field; if any other file imports `assetBalance` from this hook, those callers will TS-fail and that's the signal to clean them up.
- `agentLastTick` is *not* in this hook — `Header` (Task 9) derives it from `useDecisionLog().entries[0].blockNumber` instead, because that hook already subscribes to NewFeedback.

- [ ] **Step 6.2: Update the existing test**

Edit `web/test/lib/hooks/useVaultState.test.ts`. Add `useAccount` to the wagmi mock and assert the new fields:

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => {
  return {
    useAccount: vi.fn().mockReturnValue({ address: undefined }),
    useReadContracts: vi.fn().mockReturnValue({
      data: [
        { status: "success", result: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" },
        { status: "success", result: "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c" },
        { status: "success", result: 106n },
        { status: "success", result: "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798" },
        { status: "success", result: false },
        { status: "success", result: 1_500_000_000n }, // totalAssets
      ],
      isLoading: false,
      isError: false,
    }),
    useReadContract: vi.fn().mockReturnValue({
      data: 5_000_000_000n,
      isLoading: false,
      isError: false,
    }),
  };
});

import { useVaultState } from "../../../src/lib/hooks/useVaultState";

describe("useVaultState", () => {
  it("returns a vault state shape with totalAssets and userShares", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current.totalAssets).toBe(1_500_000_000n);
    expect(result.current.killSwitch).toBe(false);
    expect(result.current.address).toMatch(/^0x[a-fA-F0-9]{4}/);
    // userShares defaults to 0n when wallet disconnected.
    expect(result.current.userShares).toBe(0n);
  });
});
```

- [ ] **Step 6.3: Run the test**

```bash
cd web && npx vitest run test/lib/hooks/useVaultState.test.ts
```

Expected: 1/1 passing.

- [ ] **Step 6.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/lib/hooks/useVaultState.ts web/test/lib/hooks/useVaultState.test.ts
git commit -m "feat(web): useVaultState reads totalAssets + safeAssetBalance + userShares"
```

---

## Task 7 — `useWithdraw` hook

**Goal:** New hook for ERC-4626 redemption + the safe-mode `redeemAll` fallback. State machine: `idle → redeeming → done | error`. Returns the tx hash so the UI can link to MantleScan.

**Files:**
- Create: `web/src/lib/hooks/useWithdraw.ts`
- Create: `web/test/lib/hooks/useWithdraw.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `web/test/lib/hooks/useWithdraw.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useAccount = vi.fn();
const useWriteContract = vi.fn();
vi.mock("wagmi", () => ({ useAccount, useWriteContract }));

import { useWithdraw } from "../../../src/lib/hooks/useWithdraw";

describe("useWithdraw", () => {
  it("starts in idle state when wallet is disconnected", () => {
    useAccount.mockReturnValueOnce({ address: undefined, isConnected: false });
    useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useWithdraw());
    expect(result.current.state).toBe("idle");
    expect(result.current.canWithdraw).toBe(false);
  });

  it("canWithdraw is true once wallet connected", () => {
    useAccount.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useWithdraw());
    expect(result.current.canWithdraw).toBe(true);
  });
});
```

- [ ] **Step 7.2: Implement the hook**

Create `web/src/lib/hooks/useWithdraw.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { CONTRACTS, vaultAbi } from "../contracts";

export type WithdrawState = "idle" | "redeeming" | "done" | "error";

export interface WithdrawLive {
  state: WithdrawState;
  canWithdraw: boolean;
  txHash: string | undefined;
  error: string | undefined;
  /** Standard ERC-4626 redeem — burns shares, returns the risk asset.
   *  Reverts on-chain if the vault doesn't hold enough risk asset. */
  redeem: (shares: bigint, receiver: `0x${string}`, owner: `0x${string}`) => Promise<void>;
  /** Non-standard fallback — burns shares, returns pro-rata mix of risk + safe asset.
   *  Used when the vault is in safe mode. */
  redeemAll: (shares: bigint, receiver: `0x${string}`) => Promise<void>;
}

export function useWithdraw(): WithdrawLive {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<WithdrawState>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState<string>();
  const { writeContractAsync } = useWriteContract();

  const run = useCallback(async (
    fn: "redeem" | "redeemAll",
    args: readonly unknown[],
  ) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    setState("redeeming");
    try {
      const tx = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: vaultAbi,
        functionName: fn,
        args,
      });
      setTxHash(tx);
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, writeContractAsync]);

  const redeem = useCallback(
    (shares: bigint, receiver: `0x${string}`, owner: `0x${string}`) =>
      run("redeem", [shares, receiver, owner]),
    [run],
  );

  const redeemAll = useCallback(
    (shares: bigint, receiver: `0x${string}`) =>
      run("redeemAll", [shares, receiver]),
    [run],
  );

  return {
    state,
    canWithdraw: isConnected && !!address,
    txHash,
    error,
    redeem,
    redeemAll,
  };
}
```

- [ ] **Step 7.3: Run the test**

```bash
cd web && npx vitest run test/lib/hooks/useWithdraw.test.ts
```

Expected: 2/2 passing.

- [ ] **Step 7.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/lib/hooks/useWithdraw.ts web/test/lib/hooks/useWithdraw.test.ts
git commit -m "feat(web): useWithdraw hook — ERC-4626 redeem + safe-mode redeemAll"
```

---

## Task 8 — `useDeposit` refactor for ERC-4626

**Goal:** V1's `deposit(uint256)` becomes V2's `deposit(uint256, address)`. Returns the deposit tx hash plus, on success, the minted shares (parsed from the standard ERC-4626 `Deposit` event in the tx receipt — but parsing is expensive; instead let the page re-read `userShares` after the tx lands).

**Files:**
- Modify: `web/src/lib/hooks/useDeposit.ts`
- Modify: `web/test/lib/hooks/useDeposit.test.ts`

- [ ] **Step 8.1: Update the deposit call**

Edit `web/src/lib/hooks/useDeposit.ts`. Find the `writeContractAsync` call for `deposit` and change the args. Receiver is the connected account.

```ts
// before
const txDeposit = await writeContractAsync({
  address: CONTRACTS.vault,
  abi: vaultAbi,
  functionName: "deposit",
  args: [amount],
});

// after
const txDeposit = await writeContractAsync({
  address: CONTRACTS.vault,
  abi: vaultAbi,
  functionName: "deposit",
  args: [amount, address],
});
```

No other changes — `state` machine, `canDeposit`, return shape all stay the same.

- [ ] **Step 8.2: Update the existing useDeposit test**

The current test (per Plan 7) doesn't exercise the actual write — it just asserts state in disconnected / connected cases. The args change doesn't break those assertions. Verify the test still passes:

```bash
cd web && npx vitest run test/lib/hooks/useDeposit.test.ts
```

Expected: 2/2 passing. If a future test asserts the args shape, that'd need to be updated to `[amount, address]`.

- [ ] **Step 8.3: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/lib/hooks/useDeposit.ts
git commit -m "feat(web): useDeposit calls ERC-4626 deposit(amount, receiver)"
```

---

## Task 9 — `Header` component

**Goal:** Single header replacing the inline brand + status block in `page.tsx`. Three status rows on the right: KillSwitch, Agent (with last-tick time), Wallet (ConnectKit). Reads from `useVaultState` + `useDecisionLog`.

**Files:**
- Create: `web/src/components/Header.tsx`
- Create: `web/test/Header.test.tsx`

- [ ] **Step 9.1: Write the test**

Create `web/test/Header.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void; address?: string; truncatedAddress?: string }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {}, address: undefined, truncatedAddress: undefined })}</>,
  },
}));

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    killSwitch: false,
    agent: "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c",
    address: "0xCAFE…BEEF",
    totalAssets: 1000n,
  }),
}));

vi.mock("../src/lib/hooks/useDecisionLog", () => ({
  useDecisionLog: () => ({
    entries: [],
    attestationsTotal: 0,
    isLoading: false,
  }),
}));

import Header from "../src/components/Header";

describe("Header", () => {
  it("renders brand + three status rows", () => {
    const { getByText, container } = render(<Header />);
    expect(getByText("SOLVENT")).toBeTruthy();
    expect(getByText(/DEPEG\.GUARDIAN/)).toBeTruthy();
    expect(getByText(/KILLSWITCH/i)).toBeTruthy();
    expect(getByText(/AGENT/i)).toBeTruthy();
    // connect-wallet fallback button text
    expect(container.textContent?.toLowerCase()).toContain("connect");
  });
});
```

- [ ] **Step 9.2: Implement the component**

Create `web/src/components/Header.tsx`:

```tsx
"use client";

import { ConnectKitButton } from "connectkit";
import BrandMark from "./BrandMark";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDecisionLog } from "../lib/hooks/useDecisionLog";

const AGENT_REVISION = "v2.5.0";

function fmtLastTick(blockNumber: bigint | undefined, payloadTs: number | undefined): string {
  // Prefer payload-embedded unix timestamp; fall back to block number string if not yet decoded.
  if (typeof payloadTs === "number" && payloadTs > 0) {
    return new Date(payloadTs * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (blockNumber && blockNumber > 0n) return `blk ${blockNumber.toString()}`;
  return "—";
}

function StatusDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      marginRight: 6,
      verticalAlign: "middle",
    }} />
  );
}

export default function Header() {
  const vault = useVaultState();
  const log = useDecisionLog();

  const killColor = vault.killSwitch ? "var(--warm-gold)" : "var(--ink-cyan)";
  const killText  = vault.killSwitch ? "KILLSWITCH: ON " : "KILLSWITCH: OFF";

  const latest = log.entries[0];
  const lastTickStr = fmtLastTick(latest?.blockNumber, latest?.payload?.timestamp);
  // Agent dot: green if a tick landed in the last ~2 hours, otherwise dim.
  const recentMs = latest?.payload?.timestamp ? Date.now() - latest.payload.timestamp * 1000 : Number.POSITIVE_INFINITY;
  const agentLive = recentMs < 2 * 60 * 60 * 1000;
  const agentColor = agentLive ? "var(--ink-cyan)" : "rgba(207,231,255,.35)";
  const agentText  = agentLive ? `AGENT: LIVE  · last tick ${lastTickStr}` : `AGENT: IDLE  · last tick ${lastTickStr}`;

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 22,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BrandMark size={32} />
        <div>
          <div style={{ fontSize: 17, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.75, marginTop: 2 }}>
            DEPEG.GUARDIAN  ·  {AGENT_REVISION}
          </div>
        </div>
      </div>

      <div className="mono" style={{ textAlign: "right", fontSize: 11, lineHeight: 1.95, color: "var(--text-muted)" }}>
        <div style={{ color: killColor }}>
          <StatusDot color={killColor} />
          {killText}
        </div>
        <div style={{ color: agentColor }}>
          <StatusDot color={agentColor} />
          {agentText}
        </div>
        <div>
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, address }) => (
              <button
                type="button"
                onClick={show}
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid rgba(124,213,255,.35)",
                  color: "var(--ink-cyan)",
                  padding: "2px 10px",
                  fontFamily: "inherit",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  borderRadius: 2,
                }}
              >
                {isConnected ? `◇ ${truncatedAddress ?? (address ? `${address.slice(0,6)}…${address.slice(-4)}` : "wallet")} · disconnect` : "◇ connect wallet"}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.3: Run the test**

```bash
cd web && npx vitest run test/Header.test.tsx
```

Expected: 1/1 passing.

- [ ] **Step 9.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/components/Header.tsx web/test/Header.test.tsx
git commit -m "feat(web): Header component — brand + KillSwitch / Agent / Wallet status rows"
```

---

## Task 10 — `ProtectedPositionStrip` component

**Goal:** Replaces the inline `HeroStat` block in `page.tsx`. Three lines: big TVL number, user's share value line, status row (regime / div / attest / NAV / MKT).

**Files:**
- Create: `web/src/components/ProtectedPositionStrip.tsx`
- Create: `web/test/ProtectedPositionStrip.test.tsx`

- [ ] **Step 10.1: Write the test**

Create `web/test/ProtectedPositionStrip.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    totalAssets: 1_234_560_000n,    // 1234.56 USDT0 (6 dec)
    userShares: 100_000_000n,       // 100 svUSDT0
    safeAssetBalance: 0n,
    riskAssetBalance: 1_234_560_000n,
    address: "0xCAFE…BEEF",
    killSwitch: false,
  }),
}));

vi.mock("../src/lib/hooks/useOraclePrice", () => ({
  useOraclePrice: () => ({ priceWei: 1_000_000_000_000_000_000n, source: "constant", isLoading: false, isError: false }),
}));

vi.mock("../src/lib/hooks/useDexPrice", () => ({
  useDexPrice: () => ({ priceWei: 1_000_000_000_000_000_000n, fellBack: true, isLoading: false, isError: false }),
}));

vi.mock("../src/lib/hooks/useDecisionLog", () => ({
  useDecisionLog: () => ({ entries: [], attestationsTotal: 42, isLoading: false }),
}));

import ProtectedPositionStrip from "../src/components/ProtectedPositionStrip";

describe("ProtectedPositionStrip", () => {
  it("renders TVL big number + user position + status row", () => {
    const { getByText, container } = render(<ProtectedPositionStrip />);
    // $1,234.56 TVL
    expect(getByText(/\$1,234\.56/)).toBeTruthy();
    // user shares line includes "100" share count
    expect(container.textContent).toContain("100.00");
    // status row mentions REGIME / NAV / MKT
    expect(container.textContent).toMatch(/REGIME/);
    expect(container.textContent).toMatch(/NAV/);
    expect(container.textContent).toMatch(/MKT/);
    expect(container.textContent).toMatch(/ATTEST/);
  });
});
```

- [ ] **Step 10.2: Implement the component**

Create `web/src/components/ProtectedPositionStrip.tsx`:

```tsx
"use client";

import { useVaultState } from "../lib/hooks/useVaultState";
import { useOraclePrice } from "../lib/hooks/useOraclePrice";
import { useDexPrice } from "../lib/hooks/useDexPrice";
import { useDecisionLog } from "../lib/hooks/useDecisionLog";

const ASSET_DECIMALS = 6;
const SHARE_DECIMALS = 6; // ERC-4626 inherits asset decimals by default in OZ v5

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtAssetUnits(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProtectedPositionStrip() {
  const vault = useVaultState();
  const oracle = useOraclePrice();
  const dex = useDexPrice();
  const log = useDecisionLog();

  const tvlUsd = Number(vault.totalAssets) / 10 ** ASSET_DECIMALS;
  const userShareDisplay = Number(vault.userShares) / 10 ** SHARE_DECIMALS;
  // For 1:1 nominal pricing, share value in asset units ≈ shares * totalAssets/totalSupply.
  // We approximate by assuming share decimals == asset decimals at the same scale; the
  // page-level adapter (Task 14) can pass a more precise pricePerShare if needed.
  const userValueUsd = userShareDisplay; // nominally $1 per share at 1:1
  const entryUsd = userValueUsd; // entry baseline = current value (no historical tracking in V2 yet)
  const deltaPct = 0;

  const navUsd = Number(oracle.priceWei) / 1e18;
  const mktUsd = Number(dex.priceWei) / 1e18;
  const divergenceBps =
    navUsd > 0 ? Math.max(0, Math.round(((navUsd - mktUsd) / navUsd) * 10000)) : 0;
  const regime = divergenceBps >= 500 ? "TERMINAL" : divergenceBps >= 50 ? "EARLY" : "CALM";

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.14em",
          color: "var(--text-muted)",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {`// protected_position`}
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 300,
          color: "var(--ink-cyan)",
          lineHeight: 1,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        {fmtUsd(tvlUsd)}
      </div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
        {fmtAssetUnits(userValueUsd)} USDT0  ·  entry {fmtUsd(entryUsd)}  ·  Δ{" "}
        <span style={{ color: "var(--ink-cyan)" }}>{deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%</span>
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        <span>REGIME:<span style={{ color: regime === "CALM" ? "var(--ink-cyan)" : "var(--warm-gold)" }}>{regime}</span></span>
        <span>DIV:{divergenceBps}bps</span>
        <span>ATTEST:{log.attestationsTotal}/{log.attestationsTotal}</span>
        <span>NAV <span style={{ color: "var(--text-strong)" }}>{navUsd.toFixed(3)}</span></span>
        <span>MKT <span style={{ color: "var(--ink-cyan-bright)" }}>{mktUsd.toFixed(3)}</span></span>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3: Run the test**

```bash
cd web && npx vitest run test/ProtectedPositionStrip.test.tsx
```

Expected: 1/1 passing.

- [ ] **Step 10.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/components/ProtectedPositionStrip.tsx web/test/ProtectedPositionStrip.test.tsx
git commit -m "feat(web): ProtectedPositionStrip — TVL + user position + regime/NAV/MKT status row"
```

---

## Task 11 — `VaultActions` component

**Goal:** New deposit/withdraw tab panel. Wallet-not-connected → ConnectKit button takes the whole panel. Deposit tab: amount input, allowance read, two-button approve→deposit. Withdraw tab: amount input, auto-routes to `redeem` (asset out) or `redeemAll` (safe-mode mixed). Both surface MantleScan tx link on success.

**Files:**
- Create: `web/src/components/VaultActions.tsx`
- Create: `web/test/VaultActions.test.tsx`

- [ ] **Step 11.1: Write the test**

Create `web/test/VaultActions.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {} })}</>,
  },
}));

const useAccountMock = vi.fn();
const useReadContractMock = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: useAccountMock,
  useReadContract: useReadContractMock,
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

vi.mock("../src/lib/hooks/useVaultState", () => ({
  useVaultState: () => ({
    userShares: 100_000_000n,
    riskAssetBalance: 1_000_000_000n,
    safeAssetBalance: 0n,
    totalAssets: 1_000_000_000n,
  }),
}));

vi.mock("../src/lib/hooks/useDeposit", () => ({
  useDeposit: () => ({
    state: "idle",
    canDeposit: true,
    approveTxHash: undefined,
    depositTxHash: undefined,
    error: undefined,
    deposit: vi.fn(),
  }),
}));

vi.mock("../src/lib/hooks/useWithdraw", () => ({
  useWithdraw: () => ({
    state: "idle",
    canWithdraw: true,
    txHash: undefined,
    error: undefined,
    redeem: vi.fn(),
    redeemAll: vi.fn(),
  }),
}));

import VaultActions from "../src/components/VaultActions";

describe("VaultActions", () => {
  it("shows the wallet-connect fallback when disconnected", () => {
    useAccountMock.mockReturnValueOnce({ address: undefined, isConnected: false });
    useReadContractMock.mockReturnValueOnce({ data: 0n, refetch: vi.fn() });
    const { container } = render(<VaultActions />);
    expect(container.textContent?.toLowerCase()).toContain("connect");
  });

  it("renders deposit tab by default when wallet connected", () => {
    useAccountMock.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValueOnce({ data: 0n, refetch: vi.fn() });
    const { getByText, getByPlaceholderText } = render(<VaultActions />);
    expect(getByText(/DEPOSIT/i)).toBeTruthy();
    expect(getByText(/WITHDRAW/i)).toBeTruthy();
    expect(getByPlaceholderText(/0\.00/)).toBeTruthy();
    expect(getByText(/APPROVE/i)).toBeTruthy();
  });

  it("switches to withdraw tab on click", () => {
    useAccountMock.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    useReadContractMock.mockReturnValueOnce({ data: 0n, refetch: vi.fn() });
    const { getByText, container } = render(<VaultActions />);
    fireEvent.click(getByText(/WITHDRAW/i));
    expect(container.textContent?.toUpperCase()).toContain("YOUR POSITION");
  });
});
```

- [ ] **Step 11.2: Implement the component**

Create `web/src/components/VaultActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract } from "wagmi";
import Panel from "./Panel";
import { CONTRACTS, erc20Abi } from "../lib/contracts";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDeposit } from "../lib/hooks/useDeposit";
import { useWithdraw } from "../lib/hooks/useWithdraw";

const ASSET_DECIMALS = 6;
const SHARE_DECIMALS = 6;
const EXPLORER = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

function parseAmount(raw: string, decimals: number): bigint {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 10 ** decimals));
}

function fmtUnits(raw: bigint, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txLink(hash: string | undefined, label: string) {
  if (!hash) return null;
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer"
       className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
      {label} → {hash.slice(0, 10)}…
    </a>
  );
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  cursor: "pointer",
  background: active ? "rgba(124,213,255,.08)" : "transparent",
  border: "1px solid var(--ink-cyan)",
  color: "var(--ink-cyan)",
  padding: "8px 18px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 0,
});

const inputStyle: React.CSSProperties = {
  background: "rgba(124,213,255,.04)",
  border: "1px solid rgba(124,213,255,.25)",
  color: "var(--text-strong)",
  padding: "8px 12px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 14,
  width: 180,
};

const actionBtnStyle = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "transparent" : "var(--ink-cyan)",
  border: "1px solid var(--ink-cyan)",
  color: disabled ? "var(--ink-cyan)" : "var(--bg-deep, #0a1932)",
  padding: "10px 22px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 12,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 2,
  opacity: disabled ? 0.4 : 1,
});

export default function VaultActions() {
  const { address, isConnected } = useAccount();
  const vault = useVaultState();
  const dep = useDeposit();
  const wd = useWithdraw();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState<string>("");

  const allowanceRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.vault] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const allowance = (allowanceRead.data as bigint | undefined) ?? 0n;
  const amountRaw = parseAmount(amount, ASSET_DECIMALS);

  if (!isConnected) {
    return (
      <Panel title={`// vault_actions`} meta="[ EXEC ]">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: "10px 0" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Connect a wallet to deposit or withdraw.
          </div>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} style={actionBtnStyle(false)}>
                [ connect wallet ]
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </Panel>
    );
  }

  // ---- DEPOSIT TAB ----
  const depositPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {"// amount (USDT0)"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={dep.state === "approving" || dep.state === "depositing"}
          style={inputStyle}
        />
      </div>

      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <div>your shares: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(vault.userShares, SHARE_DECIMALS)} svUSDT0</span></div>
        <div>allowance: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(allowance, ASSET_DECIMALS)} USDT0</span></div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={async () => {
            if (amountRaw === 0n) return;
            // Reusing useDeposit: it handles approve internally if allowance < amount.
            // But we expose two buttons UX-wise: the APPROVE button just triggers the same
            // deposit() call early when allowance is short — the hook short-circuits to deposit
            // when allowance already covers it.
            await dep.deposit(amountRaw);
          }}
          disabled={allowance >= amountRaw || amountRaw === 0n || dep.state === "approving"}
          style={actionBtnStyle(allowance >= amountRaw || amountRaw === 0n)}
        >
          {dep.state === "approving" ? "[ approving… ]" : "[ approve ]"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (amountRaw === 0n) return;
            await dep.deposit(amountRaw);
          }}
          disabled={allowance < amountRaw || amountRaw === 0n || dep.state === "depositing"}
          style={actionBtnStyle(allowance < amountRaw || amountRaw === 0n)}
        >
          {dep.state === "depositing" ? "[ depositing… ]" : dep.state === "done" ? "[ deposited ✓ ]" : "[ deposit ]"}
        </button>
      </div>

      {txLink(dep.approveTxHash, "approve tx")}
      {txLink(dep.depositTxHash, "deposit tx")}
      {dep.error && (
        <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
          error: {dep.error}
        </div>
      )}
    </div>
  );

  // ---- WITHDRAW TAB ----
  const safeMode = vault.safeAssetBalance > 0n;
  // For withdraw, the "amount" field is interpreted as USDT0-units the user wants out.
  // Convert to shares: amount_assets * totalSupply / totalAssets. Since 1:1 nominal,
  // shares ≈ amount_raw (both 6 decimals).
  const sharesToBurn = amountRaw; // 1:1 approximation; precise math comes from convertToShares on-chain

  const withdrawPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {"// amount (USDT0)"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={wd.state === "redeeming"}
          style={inputStyle}
        />
      </div>

      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <div>your position: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(vault.userShares, SHARE_DECIMALS)} USDT0  ({fmtUnits(vault.userShares, SHARE_DECIMALS)} svUSDT0)</span></div>
        {safeMode && (
          <div style={{ color: "var(--warm-gold)" }}>
            Vault is in safe mode (USDC). Withdrawal returns a mixed USDT0+USDC pro-rata payout.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={async () => {
          if (sharesToBurn === 0n || !address) return;
          if (safeMode) {
            await wd.redeemAll(sharesToBurn, address);
          } else {
            await wd.redeem(sharesToBurn, address, address);
          }
        }}
        disabled={sharesToBurn === 0n || wd.state === "redeeming"}
        style={actionBtnStyle(sharesToBurn === 0n)}
      >
        {wd.state === "redeeming" ? "[ withdrawing… ]" : wd.state === "done" ? "[ withdrawn ✓ ]" : "[ withdraw ]"}
      </button>

      {txLink(wd.txHash, "withdraw tx")}
      {wd.error && (
        <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
          error: {wd.error}
        </div>
      )}
    </div>
  );

  return (
    <Panel title={`// vault_actions`} meta="[ EXEC ]">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 0 }}>
          <button type="button" onClick={() => setTab("deposit")}  style={tabBtnStyle(tab === "deposit")}>DEPOSIT</button>
          <button type="button" onClick={() => setTab("withdraw")} style={tabBtnStyle(tab === "withdraw")}>WITHDRAW</button>
        </div>
        {tab === "deposit" ? depositPanel : withdrawPanel}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 11.3: Run the test**

```bash
cd web && npx vitest run test/VaultActions.test.tsx
```

Expected: 3/3 passing.

- [ ] **Step 11.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/components/VaultActions.tsx web/test/VaultActions.test.tsx
git commit -m "feat(web): VaultActions — deposit/withdraw tabs with approve flow + safe-mode redeemAll"
```

---

## Task 12 — `ChartPanel` rewrite (driven by `useDecisionLog` entries)

**Goal:** Plot NAV vs MKT from the last N decoded NewFeedback payloads. Two SVG paths in the existing dashed-grid box. Mouse-move crosshair + tooltip showing tick#, regime, action, NAV, MKT, tx (short hash with MantleScan link).

**Files:**
- Rewrite: `web/src/components/ChartPanel.tsx`
- Create: `web/test/ChartPanel.test.tsx`

- [ ] **Step 12.1: Write the test**

Create `web/test/ChartPanel.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChartPanel from "../src/components/ChartPanel";

const entries = [
  {
    blockNumber: 1n,
    txHash: "0xaa" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 1,
      timestamp: 1717000000,
      regime: "CALM",
      decision: { action: "PARK_YIELD", reasonCode: "park-calm" },
      signals: { navPrice: "1000000000000000000", dexPrice: "1000000000000000000" },
    },
    payloadLoading: false,
  },
  {
    blockNumber: 2n,
    txHash: "0xbb" + "0".repeat(62),
    uri: "",
    payload: {
      tick: 2,
      timestamp: 1717003600,
      regime: "EARLY_DEPEG",
      decision: { action: "SWAP_TO_SAFE", reasonCode: "early-exit" },
      signals: { navPrice: "1000000000000000000", dexPrice: "960000000000000000" },
    },
    payloadLoading: false,
  },
];

describe("ChartPanel", () => {
  it("renders placeholder when no entries", () => {
    const { container } = render(<ChartPanel entries={[]} />);
    expect(container.textContent?.toLowerCase()).toContain("awaiting");
  });

  it("renders two SVG paths for NAV and MKT when entries present", () => {
    const { container } = render(<ChartPanel entries={entries} />);
    const paths = container.querySelectorAll("path");
    // At least 2 line paths (NAV, MKT). Additional area-fill paths may exist.
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("renders crosshair tooltip on mouse move over the chart area", () => {
    const { container, queryByText } = render(<ChartPanel entries={entries} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    fireEvent.mouseMove(svg!, { clientX: 150, clientY: 40 });
    // After mouse move, tooltip with regime + tx info should appear.
    expect(container.textContent).toMatch(/tick #/i);
  });
});
```

- [ ] **Step 12.2: Implement the rewrite**

Replace `web/src/components/ChartPanel.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import Panel from "./Panel";
import type { DecisionEntry } from "../lib/hooks/useDecisionLog";

const EXPLORER = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";
const VIEW_W = 200;
const VIEW_H = 80;
const NAV_MID = 1.0;        // y-axis centred on $1
const Y_HALF = 0.005;       // ±0.5¢ band (1.005 top, 0.995 bottom — matches V1 visual)
const TOP_VAL = NAV_MID + Y_HALF;
const BOT_VAL = NAV_MID - Y_HALF;

interface ChartPanelProps {
  entries: DecisionEntry[];
}

interface Pt { x: number; y: number; entry: DecisionEntry; nav: number; mkt: number; }

function priceFromWei(s: string | undefined): number {
  if (!s) return NaN;
  try {
    return Number(BigInt(s)) / 1e18;
  } catch {
    return NaN;
  }
}

function clampToView(price: number): number {
  const t = (TOP_VAL - price) / (TOP_VAL - BOT_VAL);
  return Math.max(0, Math.min(VIEW_H, t * VIEW_H));
}

function shortHash(h: string): string {
  return h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—";
}

export default function ChartPanel({ entries }: ChartPanelProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const pts: Pt[] = useMemo(() => {
    // Sort entries oldest → newest by blockNumber for left-to-right plotting.
    const sorted = [...entries].sort((a, b) =>
      a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0,
    );
    const n = sorted.length;
    if (n === 0) return [];
    return sorted.map((e, i) => {
      const nav = priceFromWei(e.payload?.signals?.navPrice);
      const mkt = priceFromWei(e.payload?.signals?.dexPrice);
      const x = n === 1 ? VIEW_W / 2 : (i * VIEW_W) / (n - 1);
      return {
        x,
        // We compute y per series below; this "y" is a synthetic anchor used only for crosshair Y.
        y: clampToView(isFinite(nav) ? nav : NAV_MID),
        entry: e,
        nav: isFinite(nav) ? nav : NAV_MID,
        mkt: isFinite(mkt) ? mkt : NAV_MID,
      };
    });
  }, [entries]);

  const navPath = useMemo(() => {
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${clampToView(p.nav).toFixed(2)}`).join(" ");
  }, [pts]);

  const mktPath = useMemo(() => {
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${clampToView(p.mkt).toFixed(2)}`).join(" ");
  }, [pts]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (pts.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const xInView = Math.max(0, Math.min(VIEW_W, ratio * VIEW_W));
    // Find nearest point by x.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - xInView);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    setHoverIdx(best);
  }

  function onLeave() {
    setHoverIdx(null);
  }

  if (pts.length === 0) {
    return (
      <Panel title="// price_nav_feed · last N attestations" meta="[ CH-A ]">
        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", padding: "32px 0", textAlign: "center" }}>
          awaiting attestations&hellip;
        </div>
      </Panel>
    );
  }

  const hover = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <Panel title="// price_nav_feed · last N attestations" meta="[ CH-A ]">
      <div style={{ position: "relative" }}>
        <svg
          width="100%"
          height="160"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", marginBottom: 10 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id="chart-grad-a" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-cyan)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--ink-cyan)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* mid-line */}
          <line x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} stroke="var(--ink-cyan)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
          <text x="2" y="9" fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">{TOP_VAL.toFixed(3)}</text>
          <text x="2" y={VIEW_H / 2 + 4} fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">NAV 1.000</text>
          <text x="2" y={VIEW_H - 4} fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">{BOT_VAL.toFixed(3)}</text>
          {/* MKT line */}
          <path d={mktPath} stroke="var(--ink-cyan-bright)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          {/* NAV line */}
          <path d={navPath} stroke="var(--text-strong)" strokeWidth="1.2" fill="none" strokeLinejoin="round" opacity="0.8" />
          {/* end-dot on latest */}
          <circle cx={pts[pts.length - 1].x} cy={clampToView(pts[pts.length - 1].mkt)} r="2.5" fill="var(--ink-cyan-bright)" />
          {/* crosshair */}
          {hover && (
            <>
              <line x1={hover.x} y1="0" x2={hover.x} y2={VIEW_H} stroke="var(--ink-cyan)" strokeWidth="0.5" opacity="0.6" />
              <circle cx={hover.x} cy={clampToView(hover.nav)} r="1.5" fill="var(--text-strong)" />
              <circle cx={hover.x} cy={clampToView(hover.mkt)} r="1.5" fill="var(--ink-cyan-bright)" />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="mono"
            style={{
              position: "absolute",
              top: 4,
              right: 8,
              padding: "8px 10px",
              background: "rgba(10,25,50,0.92)",
              border: "1px solid rgba(124,213,255,.25)",
              fontSize: 10.5,
              lineHeight: 1.6,
              color: "var(--text-muted)",
              pointerEvents: "none",
              minWidth: 160,
            }}
          >
            <div style={{ color: "var(--text-strong)" }}>tick #{hover.entry.payload?.tick ?? "?"}</div>
            <div>regime {hover.entry.payload?.regime ?? "?"}</div>
            <div>action {hover.entry.payload?.decision?.action ?? "—"}</div>
            <div>NAV {hover.nav.toFixed(4)}</div>
            <div>MKT <span style={{ color: "var(--ink-cyan-bright)" }}>{hover.mkt.toFixed(4)}</span></div>
            <div>
              tx{" "}
              <a href={`${EXPLORER}/tx/${hover.entry.txHash}`} target="_blank" rel="noreferrer"
                 style={{ color: "var(--ink-cyan)", textDecoration: "none", pointerEvents: "auto" }}>
                {shortHash(hover.entry.txHash)}
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="mono" style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <span>MKT line=<span style={{ color: "var(--ink-cyan-bright)" }}>cyan</span></span>
        <span>NAV line=<span style={{ color: "var(--text-strong)" }}>white</span></span>
        <span>N={pts.length} attestations</span>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 12.3: Run the test**

```bash
cd web && npx vitest run test/ChartPanel.test.tsx
```

Expected: 3/3 passing.

- [ ] **Step 12.4: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/components/ChartPanel.tsx web/test/ChartPanel.test.tsx
git commit -m "feat(web): ChartPanel rewrite — NAV vs MKT from useDecisionLog payloads + crosshair tooltip"
```

---

## Task 13 — `PolicyPanel` extended

**Goal:** Three new rows at the bottom: `allow_swap` (✓/✗ from policy allowedActions bitmask), `allow_bridge` (✓/✗), `kill_switch` (ON/OFF from vault state).

**Files:**
- Modify: `web/src/components/PolicyPanel.tsx`
- Modify: `web/src/lib/mockData.ts` (extend `PolicyView` type)
- Modify: `web/test/PolicyPanel.test.tsx` (if it exists; otherwise create)

- [ ] **Step 13.1: Extend the `PolicyView` type**

Edit `web/src/lib/mockData.ts`. Locate the `PolicyView` interface and add the new fields:

```ts
export interface PolicyView {
  earlyTrigBps: number;
  termTrigBps: number;
  maxLtvPct: number;
  safeAsset: string;
  slippageCapBps: number;
  // V2 additions
  allowSwap: boolean;
  allowBridge: boolean;
  killSwitch: boolean;
}
```

If `mockPolicy` is exported alongside, update it too:

```ts
export const mockPolicy: PolicyView = {
  earlyTrigBps: 50,
  termTrigBps: 500,
  maxLtvPct: 0,
  safeAsset: "USDC",
  slippageCapBps: 300,
  allowSwap: true,
  allowBridge: false,
  killSwitch: false,
};
```

- [ ] **Step 13.2: Extend the component**

Edit `web/src/components/PolicyPanel.tsx`. Update `buildRows`:

```ts
function buildRows(p: PolicyView): Row[] {
  return [
    { label: "early_trig",   value: `${p.earlyTrigBps} bps`,   color: "var(--ink-cyan-bright)" },
    { label: "term_trig",    value: `${p.termTrigBps} bps`,    color: "var(--ink-cyan-bright)" },
    { label: "max_ltv",      value: `${p.maxLtvPct}%`,         color: "var(--text-strong)" },
    { label: "safe_asset",   value: p.safeAsset,               color: "var(--ink-cyan)" },
    { label: "slippage_cap", value: `${p.slippageCapBps} bps`, color: "var(--text-strong)" },
    { label: "allow_swap",   value: p.allowSwap   ? "✓" : "✗", color: p.allowSwap   ? "var(--ink-cyan)" : "var(--warm-gold)" },
    { label: "allow_bridge", value: p.allowBridge ? "✓" : "✗", color: p.allowBridge ? "var(--ink-cyan)" : "var(--warm-gold)" },
    { label: "kill_switch",  value: p.killSwitch  ? "ON"  : "OFF", color: p.killSwitch  ? "var(--warm-gold)" : "var(--ink-cyan)" },
  ];
}
```

No other changes — the existing render loop handles the longer list.

- [ ] **Step 13.3: Add test**

Create or update `web/test/PolicyPanel.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PolicyPanel from "../src/components/PolicyPanel";

describe("PolicyPanel", () => {
  it("renders all rows including allow_swap, allow_bridge, kill_switch", () => {
    const { getByText } = render(
      <PolicyPanel policy={{
        earlyTrigBps: 50,
        termTrigBps: 500,
        maxLtvPct: 0,
        safeAsset: "USDC",
        slippageCapBps: 300,
        allowSwap: true,
        allowBridge: false,
        killSwitch: false,
      }} />,
    );
    expect(getByText("early_trig")).toBeTruthy();
    expect(getByText("allow_swap")).toBeTruthy();
    expect(getByText("allow_bridge")).toBeTruthy();
    expect(getByText("kill_switch")).toBeTruthy();
    expect(getByText("OFF")).toBeTruthy();
  });
});
```

- [ ] **Step 13.4: Run the test**

```bash
cd web && npx vitest run test/PolicyPanel.test.tsx
```

Expected: 1/1 passing. If a pre-existing `PolicyPanel.test.tsx` had tests against the old type, they may now require the three new fields in the mock object — update them mechanically.

- [ ] **Step 13.5: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/components/PolicyPanel.tsx web/src/lib/mockData.ts web/test/PolicyPanel.test.tsx
git commit -m "feat(web): PolicyPanel — allow_swap / allow_bridge / kill_switch rows + PolicyView fields"
```

---

## Task 14 — Page rewrite (`app/page.tsx`)

**Goal:** Drop onboarding gate, presets, deposited state. Linear render: Header → divider → ProtectedPositionStrip → grid (VaultActions | PolicyPanel) → ChartPanel (full width) → DecisionLog → ForkReplay → Footer. Delete `OnboardingFlow` and `HeroStat`.

**Files:**
- Rewrite: `web/src/app/app/page.tsx`
- Delete: `web/src/components/OnboardingFlow.tsx`
- Delete: `web/src/components/HeroStat.tsx`
- Delete: `web/test/OnboardingFlow.test.tsx`, `web/test/HeroStat.test.tsx`
- Create: `web/test/page.test.tsx`

- [ ] **Step 14.1: Write the page-render test**

Create `web/test/page.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Heavy-handed mocks for the hooks the page composes — we're only asserting
// the structural rendering (no onboarding gate, all panels present).
vi.mock("connectkit", () => ({
  ConnectKitButton: {
    Custom: ({ children }: { children: (p: { isConnected: boolean; show: () => void; address?: string; truncatedAddress?: string }) => React.ReactNode }) =>
      <>{children({ isConnected: false, show: () => {}, address: undefined, truncatedAddress: undefined })}</>,
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useReadContract: () => ({ data: 0n, refetch: vi.fn() }),
  useReadContracts: () => ({ data: undefined, isLoading: false, isError: false }),
  useWatchContractEvent: () => undefined,
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

import DashboardPage from "../src/app/app/page";

describe("DashboardPage (V2)", () => {
  it("renders without the onboarding gate", () => {
    const { container, queryByText } = render(<DashboardPage />);
    // No "Connect a wallet to begin" line from OnboardingFlow.
    expect(queryByText(/connect a wallet to begin/i)).toBeNull();
    // Brand + key panels present.
    expect(container.textContent).toContain("SOLVENT");
    expect(container.textContent?.toLowerCase()).toContain("vault_actions");
    expect(container.textContent?.toLowerCase()).toContain("policy_reg");
    expect(container.textContent?.toLowerCase()).toContain("price_nav_feed");
    expect(container.textContent?.toLowerCase()).toContain("decision_log");
  });
});
```

- [ ] **Step 14.2: Rewrite the page**

Replace `web/src/app/app/page.tsx`:

```tsx
"use client";

import DashboardFrame from "@/components/DashboardFrame";
import Header from "@/components/Header";
import ProtectedPositionStrip from "@/components/ProtectedPositionStrip";
import VaultActions from "@/components/VaultActions";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import ForkReplay from "@/components/ForkReplay";
import Footer from "@/components/Footer";
import { useVaultState } from "@/lib/hooks/useVaultState";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { useDecisionLog } from "@/lib/hooks/useDecisionLog";
import type { PolicyView, LogEntry } from "@/lib/mockData";

const AGENT_REVISION = "v2.5.0";
const DRAWING_ID = "DWG-002";
const NETWORK = "MANTLE";
const SAFE_SYMBOL = "USDC";

const ACTION_SWAP_BIT   = 1 << 1; // ActionType.SWAP_TO_SAFE
const ACTION_BRIDGE_BIT = 1 << 2; // ActionType.BRIDGE_VIA_LENDING

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

function mapReasonCode(raw: string | undefined): LogEntry["reasonCode"] {
  switch (raw) {
    case "observe":
    case "watch":            return "observe";
    case "liquidity-bridge":
    case "bridge":           return "bridge";
    case "unwind":           return "unwind";
    case "early-exit":
    case "terminal-exit":
    case "swap":             return "swap";
    case "park-calm":
    case "calm-idle":
    default:                 return "park-calm";
  }
}

export default function DashboardPage() {
  const vault = useVaultState();
  const policy = usePolicy();
  const log = useDecisionLog();

  const policyView: PolicyView = {
    earlyTrigBps: policy.earlyDivergenceBps,
    termTrigBps: policy.terminalDivergenceBps,
    maxLtvPct: Math.round(policy.maxBridgeLTVBps / 100),
    safeAsset: SAFE_SYMBOL,
    slippageCapBps: policy.maxSlippageBps,
    allowSwap: (policy.allowedActions & ACTION_SWAP_BIT) !== 0,
    allowBridge: (policy.allowedActions & ACTION_BRIDGE_BIT) !== 0,
    killSwitch: vault.killSwitch,
  };

  function entryTimestamp(e: { payload: { timestamp?: number } | undefined; payloadLoading: boolean }): string {
    const ts = e.payload?.timestamp;
    if (typeof ts === "number" && ts > 0) {
      return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return e.payloadLoading ? "…" : "—";
  }

  const logEntries: LogEntry[] = log.entries.map((e): LogEntry => ({
    timestamp: entryTimestamp(e),
    reasonCode: mapReasonCode(e.payload?.decision?.reasonCode),
    description: e.payload?.decision?.action ?? (e.payloadLoading ? "resolving…" : "(no payload)"),
    txShort: shortHash(e.txHash),
    txHash: e.txHash,
  }));

  return (
    <DashboardFrame>
      <Header />

      {/* divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          section A  ·  main view
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      <ProtectedPositionStrip />

      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 20 }}>
        <VaultActions />
        <PolicyPanel policy={policyView} />
      </div>

      <div style={{ marginTop: 22 }}>
        <ChartPanel entries={log.entries} />
      </div>

      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 22 }}>
        <DecisionLog entries={logEntries} attestationsAttested={log.attestationsTotal} attestationsTotal={log.attestationsTotal} />
        <ForkReplay />
      </div>

      <Footer revision={AGENT_REVISION} drawingId={DRAWING_ID} network={NETWORK} />
    </DashboardFrame>
  );
}
```

- [ ] **Step 14.3: Delete OnboardingFlow + HeroStat + their tests**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git rm web/src/components/OnboardingFlow.tsx
git rm web/src/components/HeroStat.tsx
git rm web/test/OnboardingFlow.test.tsx 2>/dev/null || true
git rm web/test/HeroStat.test.tsx 2>/dev/null || true
```

If any other source file imports these (besides the page we just rewrote), find and remove:

```bash
grep -r "OnboardingFlow\|HeroStat" web/src web/test 2>/dev/null
```

Expected: empty output. If matches exist, clean them up.

- [ ] **Step 14.4: Run the page test + full suite**

```bash
cd web && npx vitest run test/page.test.tsx
cd web && npx vitest run
```

Expected: page test passes, full suite green (47 baseline − 2 deleted onboarding/herostat tests + 6 new component tests + a few hook updates ≈ 51–53 total).

- [ ] **Step 14.5: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: clean. If a `PolicyPanel.tsx`-typed prop somewhere uses old `PolicyView` without the new fields, fix the call site to include them.

- [ ] **Step 14.6: Commit**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add web/src/app/app/page.tsx web/test/page.test.tsx
git commit -m "feat(web): page rewrite — Header + ProtectedPositionStrip + VaultActions + extended PolicyPanel; drop onboarding gate"
```

---

## Task 15 — Smoke tests, docs, push, deploy

**Goal:** Full suite green; build green; README + demo script updated; branch pushed; Vercel preview verified; merge to master.

**Files:**
- Modify: `README.md`
- Modify: `docs/demo-script.md`

- [ ] **Step 15.1: Run the full suites**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
cd contracts && forge test
cd ../web && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -10
```

Expected: contracts ≥ 68 passing; vitest all passing; tsc clean; `npm run build` reports a successful Next.js build, "out" directory written.

If any suite fails — fix in place; don't proceed.

- [ ] **Step 15.2: Update README**

Edit the root `README.md`. Find the "Architecture" section and the addresses table; update to reference V2:

```markdown
## What it does

Solvent is an autonomous on-chain agent that monitors an RWA-style vault on
Mantle every hour, watching the spread between NAV and DEX market price.
Permissionless ERC-4626 vault (`SolventVaultV2`) — anyone can deposit USDT0
and mint shares. When divergence crosses policy thresholds, the agent
executes a pre-approved protective swap and attests the decision to the
Mantle-deployed ERC-8004 ReputationRegistry.

## Live links

| | |
|---|---|
| Dashboard | https://solvent-three.vercel.app |
| SolventVaultV2 (active) | https://mantlescan.xyz/address/<V2_ADDRESS from Task 3> |
| SolventVault V1 (deprecated) | https://mantlescan.xyz/address/0x06513470e16a7d6071A12708c38a6fa0ED66469c |
| SolventAttestation | https://mantlescan.xyz/address/0x89D3F83B777b245A80baec60277B449B8E72B5D3 |
| Agent EOA | https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c |
| ERC-8004 ReputationRegistry | https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 |
```

Add a "V2 architecture" sub-bullet under contracts:

```markdown
- `SolventVaultV2` — ERC-4626 vault. Shares (`svUSDT0`) mint 1:1 on deposit.
  `totalAssets()` counts the policy safe-asset balance at nominal 1:1 so
  share value is preserved across `SWAP_TO_SAFE`. Adds `redeemAll(shares,
  receiver)` for the safe-mode mixed-asset redemption path.
- `SolventVault` (V1) — custody-only deployer vault. Kept on-chain as
  deprecated reference; kill-switched 2026-05-30.
```

- [ ] **Step 15.3: Update demo script**

Edit `docs/demo-script.md`. Find the beat that mentions the deposit modal / onboarding flow (search for "modal" or "onboarding"). Replace with:

```markdown
## 3:00–4:00 — Live deposit demo (60s)

> [Open dashboard URL in browser]

> Solvent V2 is a permissionless ERC-4626 vault. Anyone with USDT0 on Mantle
> can deposit and mint svUSDT0 shares. Click "connect wallet" in the top
> right — ConnectKit modal, pick any wallet, sign.

> [Connected]

> Now I'm in the same dashboard the agent watches. Type "10" in the deposit
> tab — that's 10 USDT0. First click approves the spend; second click
> mints 10 svUSDT0 shares. Tx links go straight to MantleScan.

> Withdrawing's the same shape. If the agent has fired SWAP_TO_SAFE, the
> vault holds USDC instead of USDT0; the WITHDRAW button auto-routes to
> `redeemAll` for a pro-rata USDT0+USDC payout — and the panel tells you
> that's what'll happen.
```

- [ ] **Step 15.4: Push branch**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git add README.md docs/demo-script.md
git commit -m "docs: README + demo script for V2 (ERC-4626 vault, deposit-via-wallet beat)"
git push origin plan-8-v2-redesign
```

- [ ] **Step 15.5: USER-ACTION GATE — verify Vercel preview**

STOP. Surface to controller:

> **Action required:** The push to `plan-8-v2-redesign` triggers a Vercel preview deploy. Once the preview is green:
>
> 1. Open the preview URL (Vercel posts it to the PR / branch view).
> 2. Confirm the new layout: Header at top, `// protected_position` strip below, `vault_actions` + `policy_reg` row, full-width `price_nav_feed` chart, `decision_log` + `fork_replay` row, footer. No onboarding gate.
> 3. Click "connect wallet" — ConnectKit modal opens.
> 4. From a fresh test wallet with ~1 USDT0 on Mantle:
>    - Deposit: approve, then deposit. Confirm svUSDT0 shares show up in the deposit tab's "your shares" row + tx link works.
>    - Withdraw: pick a small amount, click withdraw. Confirm asset comes back + tx link works.
> 5. Sanity-check the decision log shows the latest agent tick (≤ 1 hour old).
> 6. Confirm the chart renders two lines (NAV ≈ MKT ≈ 1.000 since live pool has no liquidity, but the lines should be there).
>
> If anything's broken, the controller fixes via additional commits to the branch. If all green, proceed to merge.

Wait for green confirmation.

- [ ] **Step 15.6: Merge to master**

Use the `superpowers:finishing-a-development-branch` skill — present merge / PR / squash options to the user, executing whichever they pick. Typical flow:

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git checkout master
git merge --no-ff plan-8-v2-redesign -m "Merge plan-8-v2-redesign: V2 ERC-4626 vault + dashboard redesign"
git push origin master
```

- [ ] **Step 15.7: USER-ACTION GATE — Vercel production env (if not already)**

If T5 Step 5.5 only updated Preview, update Production now:

> **Action required:** On Vercel, update `NEXT_PUBLIC_VAULT_ADDRESS` for the **Production** environment to the V2 address from Task 3. Redeploy production (or merge to master already auto-deploys; double-check the Production env var is V2).

After this gate, V2 is fully live.

- [ ] **Step 15.8: Final commit hygiene**

If anything was fixed during T15.5 verification, those commits are already on `plan-8-v2-redesign` before the merge. Confirm master has them:

```bash
git log master -10 --oneline
```

Expected: V2 redesign commits at the top, plus the merge commit.

---

## Self-review

### Spec coverage

| Spec line | Task |
|---|---|
| SolventVaultV2 ERC4626 inheritance | T1 (Step 1.3) |
| Retained policy / agent / attestation / actions | T1 (Steps 1.6, 1.8) |
| `totalAssets()` includes safe at 1:1 | T1 (Step 1.3) |
| `redeemAll(shares, receiver)` | T1 (Step 1.11) |
| `rescue()` owner-only kill-switch-gated | T1 (Step 1.11) |
| Removed V1 owner-deposit / withdraw / withdrawToken | T1 (Step 1.3 — V2 simply inherits ERC-4626 surface; old V1 owner methods don't exist on V2) |
| V2 default policy (SWAP_TO_SAFE only) | T2 (DeployV2.s.sol), T1 (`_policy()` test helper) |
| ≥15 Foundry tests V2 | T1 (15 tests across Steps 1.1, 1.5, 1.7, 1.9, 1.10, 1.12) |
| Deploy + migration scripts | T2 |
| Mainnet broadcast | T3 (USER-ACTION GATE) |
| V1 kill switch | T3 (Step 3.2) |
| Update `mantle-mainnet.json` | T3 (Step 3.4) |
| Agent ABI swap | T4 |
| GH secret update | T4 (USER-ACTION GATE) |
| Dashboard contracts.ts → V2 | T5 |
| Vercel env update | T5 (USER-ACTION GATE) |
| `useVaultState` extended (totalAssets + userShares + killSwitch) | T6 |
| `useWithdraw` new | T7 |
| `useDeposit` refactor (ERC-4626 args) | T8 |
| Header component | T9 |
| ProtectedPositionStrip component | T10 |
| VaultActions component (deposit + withdraw tabs, wallet fallback) | T11 |
| ChartPanel rewrite (NAV+MKT from useDecisionLog, crosshair) | T12 |
| PolicyPanel extended (allow_swap / allow_bridge / kill_switch) | T13 |
| Page rewrite (no onboarding) + delete OnboardingFlow + HeroStat | T14 |
| ≥6 vitest component tests | T9–T14 (Header, ProtectedPositionStrip, VaultActions 3-test, ChartPanel 3-test, PolicyPanel, page) |
| README + demo script updates | T15 (Steps 15.2, 15.3) |
| Live end-to-end test | T15 (Step 15.5 USER-ACTION GATE) |
| Merge | T15 (Step 15.6) |

### Placeholder scan

Walked through each task. The only `<...>` placeholders are:
- `<V2_ADDRESS from Task 3>` in T3.4, T4.3, T5.2, T5.3, T15.2 — intentional; address is generated by T3.3 broadcast and cannot be known at plan-write time. Marked clearly so the executor knows to substitute the real value.
- `<tx hash from broadcast log>` in T3.4 — same reason; produced by T3.2 / T3.3.

No "TBD", "implement later", or empty code stubs. Every Solidity / TypeScript block is real compilable code.

### Type consistency

- `VaultStateLive` interface in `useVaultState.ts` (T6) exposes `totalAssets`, `riskAssetBalance`, `safeAssetBalance`, `userShares`, `killSwitch`. Consumed identically by `Header` (T9), `ProtectedPositionStrip` (T10), `VaultActions` (T11), and the page (T14).
- `PolicyView` in `mockData.ts` (T13.1) extended with `allowSwap` / `allowBridge` / `killSwitch`; constructed in page (T14.2) from `usePolicy().allowedActions` bitmask + `useVaultState().killSwitch`; consumed in `PolicyPanel` (T13.2).
- `DecisionEntry` (existing, from `useDecisionLog.ts`) consumed by `ChartPanel` (T12) and the page (T14) — same shape, no divergence.
- `DepositLive` / `WithdrawLive` (T8 / T7) consumed only by `VaultActions` (T11). State machines match: idle → working → done / error.

### USER-ACTION GATE inventory

Explicit STOP markers at:
- **T3** (Steps 3.2, 3.3) — mainnet broadcast with cold deployer key
- **T4** (Step 4.5) — GitHub Actions `VAULT_ADDRESS` secret
- **T5** (Step 5.5) — Vercel preview env var
- **T15** (Step 15.5) — live preview verification end-to-end
- **T15** (Step 15.7) — Vercel production env var (if separate from preview)

Each gate names the exact resource (URL or file), the exact action, and the data the user supplies back to the controller. The controller relays to the user and waits for confirmation before unblocking subsequent tasks.
