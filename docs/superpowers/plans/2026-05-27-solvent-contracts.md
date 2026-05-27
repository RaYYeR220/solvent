# Solvent Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and unit-test the on-chain core of Solvent — a vault that holds a user's RWA, enforces a user policy on-chain, lets a scoped agent execute only pre-approved protective actions, and records every decision to an append-only attestation log keyed by an ERC-8004 agent identity.

**Architecture:** The vault is a "dumb" executor and trust anchor: it holds custody, validates each agent action against an on-chain `Policy`, and forwards a decision record to `SolventAttestation`. All external protocols (DEX, lending venue, ERC-8004 Identity Registry) are reached through narrow interfaces (`IDexRouter`, `ILendingVenue`, `IIdentityRegistry`) so this plan tests the full vault logic against mocks with zero external-interface uncertainty. Real protocol adapters and fork integration come in a later plan.

**Tech Stack:** Solidity ^0.8.24, Foundry (forge/anvil), OpenZeppelin contracts (IERC20/SafeERC20/ReentrancyGuard), forge-std for tests. Target chain at deploy: Mantle mainnet.

---

## File Structure

```
contracts/
  foundry.toml
  remappings.txt
  .env.example
  src/
    Policy.sol                  # enums (ActionType, Regime), Policy struct, PolicyLib
    interfaces/
      IDexRouter.sol            # Uniswap-V2-style swap interface we depend on
      ILendingVenue.sol         # supply/borrow/repay/withdraw abstraction
      IIdentityRegistry.sol     # minimal ERC-8004 Identity Registry subset
    SolventAttestation.sol      # append-only decision log keyed by agentId
    SolventVault.sol            # custody + policy enforcement + action dispatch
  test/
    mocks/
      MockERC20.sol             # configurable-decimals ERC20 for tests
      MockDexRouter.sol         # swaps at a configurable rate, pre-funded
      MockLendingVenue.sol      # supply/borrow/repay/withdraw bookkeeping
      MockIdentityRegistry.sol  # returns incrementing agentIds
    Policy.t.sol
    SolventAttestation.t.sol
    SolventVault.t.sol          # access control, deposit/withdraw, setters, killswitch
    SolventVaultActions.t.sol   # executeProtectiveAction: swap/bridge/unwind/park + guardrails
  script/
    Deploy.s.sol                # registers agent identity, deploys attestation + vault
```

**Responsibility split:** `Policy.sol` holds the value types and the bitmap helper. The three interface files each describe exactly one external dependency. `SolventAttestation.sol` is a standalone append-only log (no vault knowledge beyond `msg.sender`). `SolventVault.sol` is the only contract with privileged logic; its action handlers are split across two test files purely so each test file stays focused.

---

## Task 1: Scaffold Foundry project

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/remappings.txt`
- Create: `contracts/.env.example`
- Create: `contracts/test/mocks/MockERC20.sol`
- Create: `contracts/test/Scaffold.t.sol`

- [ ] **Step 1: Initialize Foundry and install dependencies**

Run:
```bash
cd contracts
forge init --no-commit --no-git .
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
```
Expected: `lib/forge-std` and `lib/openzeppelin-contracts` exist; the default Counter files are gone.

- [ ] **Step 2: Write config files**

`contracts/foundry.toml`:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
ffi = false

[rpc_endpoints]
mantle = "${MANTLE_RPC_URL}"
```

`contracts/remappings.txt`:
```
forge-std/=lib/forge-std/src/
@openzeppelin/=lib/openzeppelin-contracts/
```

`contracts/.env.example`:
```
# Mantle mainnet RPC (e.g. https://rpc.mantle.xyz)
MANTLE_RPC_URL=
# Deployer/agent private key (hex, 0x-prefixed). Use a throwaway key for the agent.
PRIVATE_KEY=
# Filled in during deploy (see Task 9 open items / config)
ASSET_ADDRESS=
SAFE_ASSET_ADDRESS=
DEX_ROUTER_ADDRESS=
BRIDGE_VENUE_ADDRESS=
YIELD_VENUE_ADDRESS=
IDENTITY_REGISTRY_ADDRESS=
```

- [ ] **Step 3: Write `MockERC20` (used by every later test)**

`contracts/test/mocks/MockERC20.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 4: Write a scaffold sanity test**

`contracts/test/Scaffold.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ScaffoldTest is Test {
    function test_mockMintsWithDecimals() public {
        MockERC20 token = new MockERC20("USD Yield", "USDY", 18);
        token.mint(address(this), 1e18);
        assertEq(token.decimals(), 18);
        assertEq(token.balanceOf(address(this)), 1e18);
    }
}
```

- [ ] **Step 5: Build and test**

Run: `forge test -vvv`
Expected: compiles; `test_mockMintsWithDecimals` PASSES.

- [ ] **Step 6: Commit**

```bash
git add contracts/foundry.toml contracts/remappings.txt contracts/.env.example contracts/test/mocks/MockERC20.sol contracts/test/Scaffold.t.sol contracts/lib contracts/.gitmodules
git commit -m "chore(contracts): scaffold Foundry project with deps and MockERC20"
```

---

## Task 2: Policy types and action-bitmap helper

**Files:**
- Create: `contracts/src/Policy.sol`
- Create: `contracts/test/Policy.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/Policy.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Policy, ActionType, PolicyLib} from "../src/Policy.sol";

contract PolicyTest is Test {
    using PolicyLib for Policy;

    function _policyAllowing(ActionType a) internal pure returns (Policy memory p) {
        p.allowedActions = uint32(1) << uint8(a);
    }

    function test_allowedActionReturnsTrue() public pure {
        Policy memory p = _policyAllowing(ActionType.SWAP_TO_SAFE);
        assertTrue(p.isActionAllowed(ActionType.SWAP_TO_SAFE));
    }

    function test_disallowedActionReturnsFalse() public pure {
        Policy memory p = _policyAllowing(ActionType.SWAP_TO_SAFE);
        assertFalse(p.isActionAllowed(ActionType.BRIDGE_VIA_LENDING));
    }

    function test_multipleAllowedActions() public pure {
        Policy memory p;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));
        assertTrue(p.isActionAllowed(ActionType.SWAP_TO_SAFE));
        assertTrue(p.isActionAllowed(ActionType.PARK_YIELD));
        assertFalse(p.isActionAllowed(ActionType.BRIDGE_VIA_LENDING));
    }

    function test_noneIsNeverAllowed() public pure {
        Policy memory p;
        p.allowedActions = type(uint32).max;
        assertFalse(p.isActionAllowed(ActionType.NONE));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract PolicyTest -vvv`
Expected: FAIL — `Policy.sol` does not exist / cannot find `PolicyLib`.

- [ ] **Step 3: Write minimal implementation**

`contracts/src/Policy.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Ordered so the bitmap `1 << uint8(action)` is stable. NONE must be 0.
enum ActionType {
    NONE,
    SWAP_TO_SAFE,
    BRIDGE_VIA_LENDING,
    UNWIND_BRIDGE,
    PARK_YIELD
}

enum Regime {
    CALM,
    WATCH,
    EARLY_DEPEG,
    TERMINAL_DEPEG
}

/// @notice User-set risk policy. Fields consumed off-chain by the agent
/// (divergence thresholds, liquidity floor) are stored on-chain for
/// verifiability; fields enforced on-chain by the vault are noted below.
struct Policy {
    uint16 earlyDivergenceBps;    // off-chain: WATCH -> EARLY trigger
    uint16 terminalDivergenceBps; // off-chain: EARLY -> TERMINAL trigger
    uint256 liquidityFloor;       // off-chain: min acceptable pool depth
    uint16 maxSlippageBps;        // ON-CHAIN: swap floor vs assumed 1:1 safe peg
    address safeAsset;            // ON-CHAIN: only allowed swap/borrow output
    address bridgeVenue;          // ON-CHAIN: only allowed lending venue
    uint16 maxBridgeLTVBps;       // ON-CHAIN: cap on borrow/collateral ratio
    uint32 allowedActions;        // ON-CHAIN: bitmap over ActionType
}

library PolicyLib {
    function isActionAllowed(Policy memory p, ActionType action) internal pure returns (bool) {
        if (action == ActionType.NONE) return false;
        return (p.allowedActions & (uint32(1) << uint8(action))) != 0;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract PolicyTest -vvv`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/Policy.sol contracts/test/Policy.t.sol
git commit -m "feat(contracts): add Policy types and action-bitmap helper"
```

---

## Task 3: External-dependency interfaces and mocks

**Files:**
- Create: `contracts/src/interfaces/IDexRouter.sol`
- Create: `contracts/src/interfaces/ILendingVenue.sol`
- Create: `contracts/src/interfaces/IIdentityRegistry.sol`
- Create: `contracts/test/mocks/MockDexRouter.sol`
- Create: `contracts/test/mocks/MockLendingVenue.sol`
- Create: `contracts/test/mocks/MockIdentityRegistry.sol`
- Create: `contracts/test/Mocks.t.sol`

- [ ] **Step 1: Write the interfaces**

`contracts/src/interfaces/IDexRouter.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Uniswap-V2-style router subset the vault depends on.
interface IDexRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
```

`contracts/src/interfaces/ILendingVenue.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Lending-venue abstraction. Real adapters (Aave V3 IPool, INIT
/// Capital) implement this in a later plan; the vault only ever sees this.
interface ILendingVenue {
    function supply(address asset, uint256 amount, address onBehalfOf) external;
    function borrow(address asset, uint256 amount, address onBehalfOf) external;
    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
```

`contracts/src/interfaces/IIdentityRegistry.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of the ERC-8004 Identity Registry the deploy
/// script uses to mint the agent's identity passport.
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}
```

- [ ] **Step 2: Write the mocks**

`contracts/test/mocks/MockDexRouter.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IDexRouter} from "../../src/interfaces/IDexRouter.sol";

/// @dev Swaps path[0] -> path[last] at `rateBps` (10000 = 1:1 in value),
/// decimal-adjusted. Must be pre-funded with the output token.
contract MockDexRouter is IDexRouter {
    uint256 public rateBps = 10000;

    function setRateBps(uint256 r) external {
        rateBps = r;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        uint8 di = IERC20Metadata(tokenIn).decimals();
        uint8 dout = IERC20Metadata(tokenOut).decimals();
        uint256 out = (amountIn * rateBps * (10 ** dout)) / (10000 * (10 ** di));
        require(out >= amountOutMin, "MockDexRouter: insufficient output");

        IERC20(tokenOut).transfer(to, out);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}
```

`contracts/test/mocks/MockLendingVenue.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILendingVenue} from "../../src/interfaces/ILendingVenue.sol";

/// @dev Minimal bookkeeping venue. Must be pre-funded with borrowable tokens.
contract MockLendingVenue is ILendingVenue {
    mapping(address => mapping(address => uint256)) public supplied; // user => asset => amount
    mapping(address => mapping(address => uint256)) public borrowed; // user => asset => amount

    function supply(address asset, uint256 amount, address onBehalfOf) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        borrowed[onBehalfOf][asset] += amount;
        IERC20(asset).transfer(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        borrowed[onBehalfOf][asset] -= amount;
        return amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        supplied[msg.sender][asset] -= amount;
        IERC20(asset).transfer(to, amount);
        return amount;
    }
}
```

`contracts/test/mocks/MockIdentityRegistry.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    uint256 public nextId = 1;
    mapping(uint256 => address) public owners;

    function register(string calldata) external returns (uint256 agentId) {
        agentId = nextId++;
        owners[agentId] = msg.sender;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }
}
```

- [ ] **Step 3: Write the failing test**

`contracts/test/Mocks.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockDexRouter} from "./mocks/MockDexRouter.sol";
import {MockLendingVenue} from "./mocks/MockLendingVenue.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract MocksTest is Test {
    function test_dexRouterSwapsAtRateWithDecimals() public {
        MockERC20 usdy = new MockERC20("USDY", "USDY", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockDexRouter router = new MockDexRouter();

        usdy.mint(address(this), 100e18);
        usdc.mint(address(router), 1_000e6); // pre-fund output
        usdy.approve(address(router), 100e18);

        address[] memory path = new address[](2);
        path[0] = address(usdy);
        path[1] = address(usdc);

        router.swapExactTokensForTokens(100e18, 0, path, address(this), block.timestamp);
        assertEq(usdc.balanceOf(address(this)), 100e6); // 1:1 value, decimal-adjusted
    }

    function test_lendingVenueSupplyAndBorrow() public {
        MockERC20 usdy = new MockERC20("USDY", "USDY", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockLendingVenue venue = new MockLendingVenue();

        usdy.mint(address(this), 100e18);
        usdc.mint(address(venue), 1_000e6); // pre-fund borrowable
        usdy.approve(address(venue), 100e18);

        venue.supply(address(usdy), 100e18, address(this));
        assertEq(venue.supplied(address(this), address(usdy)), 100e18);

        venue.borrow(address(usdc), 40e6, address(this));
        assertEq(usdc.balanceOf(address(this)), 40e6);
        assertEq(venue.borrowed(address(this), address(usdc)), 40e6);
    }

    function test_identityRegistryReturnsIncrementingIds() public {
        MockIdentityRegistry reg = new MockIdentityRegistry();
        uint256 id1 = reg.register("ipfs://agent-uri");
        uint256 id2 = reg.register("ipfs://agent-uri");
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(reg.ownerOf(1), address(this));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract MocksTest -vvv`
Expected: all three tests PASS (interfaces + mocks compile and behave).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/interfaces contracts/test/mocks/MockDexRouter.sol contracts/test/mocks/MockLendingVenue.sol contracts/test/mocks/MockIdentityRegistry.sol contracts/test/Mocks.t.sol
git commit -m "feat(contracts): add external interfaces and test mocks"
```

---

## Task 4: SolventAttestation append-only decision log

**Files:**
- Create: `contracts/src/SolventAttestation.sol`
- Create: `contracts/test/SolventAttestation.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/SolventAttestation.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {ActionType, Regime} from "../src/Policy.sol";

contract SolventAttestationTest is Test {
    SolventAttestation att;

    event DecisionRecorded(
        uint256 indexed agentId,
        address indexed vault,
        uint256 indexed index,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome
    );

    function setUp() public {
        att = new SolventAttestation();
    }

    function test_recordStoresDecisionAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit DecisionRecorded(
            7, address(this), 0, Regime.EARLY_DEPEG, bytes32("early-exit"),
            keccak256("signals"), ActionType.SWAP_TO_SAFE, int256(99e6)
        );

        att.record(
            7, Regime.EARLY_DEPEG, bytes32("early-exit"),
            keccak256("signals"), ActionType.SWAP_TO_SAFE, int256(99e6)
        );

        assertEq(att.decisionCount(address(this)), 1);
        (uint256 agentId,, Regime regime,,, ActionType action, int256 outcome) =
            att.decisionAt(address(this), 0);
        assertEq(agentId, 7);
        assertEq(uint8(regime), uint8(Regime.EARLY_DEPEG));
        assertEq(uint8(action), uint8(ActionType.SWAP_TO_SAFE));
        assertEq(outcome, int256(99e6));
    }

    function test_indexIncrementsPerVault() public {
        att.record(1, Regime.WATCH, bytes32("watch"), bytes32(0), ActionType.NONE, 0);
        att.record(1, Regime.CALM, bytes32("park"), bytes32(0), ActionType.PARK_YIELD, 0);
        assertEq(att.decisionCount(address(this)), 2);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SolventAttestationTest -vvv`
Expected: FAIL — `SolventAttestation.sol` does not exist.

- [ ] **Step 3: Write minimal implementation**

`contracts/src/SolventAttestation.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ActionType, Regime} from "./Policy.sol";

/// @notice Append-only log of agent decisions, keyed by the calling vault and
/// tagged with the agent's ERC-8004 identity id. Permissionless to write;
/// each record carries `msg.sender` so consumers filter by vault. This is the
/// verifiable "Turing-test transcript".
contract SolventAttestation {
    struct Decision {
        uint256 agentId;
        uint64 timestamp;
        Regime regime;
        bytes32 reasonCode;
        bytes32 signalsHash;
        ActionType action;
        int256 outcome; // signed: value preserved/gained (+) or realized loss (-), in safe-asset units
    }

    mapping(address => Decision[]) private _decisions; // vault => decisions

    event DecisionRecorded(
        uint256 indexed agentId,
        address indexed vault,
        uint256 indexed index,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome
    );

    function record(
        uint256 agentId,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome
    ) external returns (uint256 index) {
        index = _decisions[msg.sender].length;
        _decisions[msg.sender].push(
            Decision({
                agentId: agentId,
                timestamp: uint64(block.timestamp),
                regime: regime,
                reasonCode: reasonCode,
                signalsHash: signalsHash,
                action: action,
                outcome: outcome
            })
        );
        emit DecisionRecorded(agentId, msg.sender, index, regime, reasonCode, signalsHash, action, outcome);
    }

    function decisionCount(address vault) external view returns (uint256) {
        return _decisions[vault].length;
    }

    function decisionAt(address vault, uint256 index)
        external
        view
        returns (
            uint256 agentId,
            uint64 timestamp,
            Regime regime,
            bytes32 reasonCode,
            bytes32 signalsHash,
            ActionType action,
            int256 outcome
        )
    {
        Decision storage d = _decisions[vault][index];
        return (d.agentId, d.timestamp, d.regime, d.reasonCode, d.signalsHash, d.action, d.outcome);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SolventAttestationTest -vvv`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/SolventAttestation.sol contracts/test/SolventAttestation.t.sol
git commit -m "feat(contracts): add SolventAttestation append-only decision log"
```

---

## Task 5: SolventVault core — custody, roles, killswitch

**Files:**
- Create: `contracts/src/SolventVault.sol`
- Create: `contracts/test/SolventVault.t.sol`

This task creates the full `SolventVault` storage/constructor and the owner-facing surface (deposit, withdraw, setters, killswitch) plus access control. Action handlers are added in Tasks 6–8 by extending this same file; their tests live in `SolventVaultActions.t.sol`.

- [ ] **Step 1: Write the failing test**

`contracts/test/SolventVault.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SolventVaultTest is Test {
    SolventVault vault;
    SolventAttestation att;
    MockERC20 usdy;
    MockERC20 usdc;

    address owner = address(0xA11CE);
    address agent = address(0xA6E27);
    address stranger = address(0xBAD);

    function _basePolicy() internal view returns (Policy memory p) {
        p.maxSlippageBps = 300;
        p.safeAsset = address(usdc);
        p.maxBridgeLTVBps = 5000;
        p.allowedActions = uint32(1) << uint8(ActionType.SWAP_TO_SAFE);
    }

    function setUp() public {
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        att = new SolventAttestation();
        vm.prank(owner);
        vault = new SolventVault(address(usdy), owner, agent, 42, address(att), _basePolicy());
        usdy.mint(owner, 1_000e18);
    }

    function test_constructorSetsRolesAndIdentity() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.agent(), agent);
        assertEq(vault.agentId(), 42);
        assertEq(address(vault.asset()), address(usdy));
    }

    function test_ownerCanDepositAndWithdraw() public {
        vm.startPrank(owner);
        usdy.approve(address(vault), 500e18);
        vault.deposit(500e18);
        assertEq(usdy.balanceOf(address(vault)), 500e18);
        vault.withdraw(200e18);
        assertEq(usdy.balanceOf(owner), 700e18);
        vm.stopPrank();
    }

    function test_strangerCannotDeposit() public {
        usdy.mint(stranger, 100e18);
        vm.startPrank(stranger);
        usdy.approve(address(vault), 100e18);
        vm.expectRevert(SolventVault.NotOwner.selector);
        vault.deposit(100e18);
        vm.stopPrank();
    }

    function test_onlyOwnerSetsAgentAndPolicyAndKill() public {
        vm.expectRevert(SolventVault.NotOwner.selector);
        vm.prank(stranger);
        vault.setAgent(stranger);

        vm.startPrank(owner);
        vault.setAgent(address(0xC0FFEE));
        assertEq(vault.agent(), address(0xC0FFEE));
        vault.setKillSwitch(true);
        assertTrue(vault.killSwitch());
        vm.stopPrank();
    }

    function test_agentCannotWithdraw() public {
        vm.prank(owner);
        usdy.approve(address(vault), 100e18);
        vm.prank(owner);
        vault.deposit(100e18);

        vm.expectRevert(SolventVault.NotOwner.selector);
        vm.prank(agent);
        vault.withdraw(1e18);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SolventVaultTest -vvv`
Expected: FAIL — `SolventVault.sol` does not exist.

- [ ] **Step 3: Write minimal implementation**

`contracts/src/SolventVault.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Policy, ActionType, Regime, PolicyLib} from "./Policy.sol";
import {SolventAttestation} from "./SolventAttestation.sol";

/// @notice Custody + on-chain policy enforcement. The agent may only execute
/// pre-approved protective actions; it can never withdraw to an arbitrary
/// address. The owner can always withdraw and can flip the kill switch.
contract SolventVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PolicyLib for Policy;

    IERC20 public immutable asset;
    uint256 public immutable agentId;
    SolventAttestation public immutable attestation;

    address public owner;
    address public agent;
    bool public killSwitch;
    Policy public policy;

    error NotOwner();
    error NotAgent();
    error Killed();
    error ActionNotAllowed(ActionType action);

    event AgentChanged(address indexed agent);
    event PolicyChanged();
    event KillSwitchSet(bool active);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

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
    ) {
        asset = IERC20(asset_);
        owner = owner_;
        agent = agent_;
        agentId = agentId_;
        attestation = SolventAttestation(attestation_);
        policy = policy_;
    }

    // --- owner surface ---

    function deposit(uint256 amount) external onlyOwner {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(amount);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(amount);
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setPolicy(Policy calldata policy_) external onlyOwner {
        policy = policy_;
        emit PolicyChanged();
    }

    function setKillSwitch(bool active) external onlyOwner {
        killSwitch = active;
        emit KillSwitchSet(active);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SolventVaultTest -vvv`
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/SolventVault.sol contracts/test/SolventVault.t.sol
git commit -m "feat(contracts): add SolventVault custody, roles, and kill switch"
```

---

## Task 6: executeProtectiveAction dispatch + SWAP_TO_SAFE handler

**Files:**
- Modify: `contracts/src/SolventVault.sol` (add router config, dispatch, `_swapToSafe`, attest)
- Create: `contracts/test/SolventVaultActions.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/SolventVaultActions.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockDexRouter} from "./mocks/MockDexRouter.sol";

contract SolventVaultSwapTest is Test {
    SolventVault vault;
    SolventAttestation att;
    MockERC20 usdy;
    MockERC20 usdc;
    MockDexRouter router;

    address owner = address(0xA11CE);
    address agent = address(0xA6E27);

    function _policy() internal view returns (Policy memory p) {
        p.maxSlippageBps = 300; // 3%
        p.safeAsset = address(usdc);
        p.allowedActions = uint32(1) << uint8(ActionType.SWAP_TO_SAFE);
    }

    function setUp() public {
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        router = new MockDexRouter();
        att = new SolventAttestation();

        vm.prank(owner);
        vault = new SolventVault(address(usdy), owner, agent, 42, address(att), _policy());

        vm.prank(owner);
        vault.setDexRouter(address(router));

        // fund vault with collateral, router with output liquidity
        usdy.mint(owner, 1_000e18);
        usdc.mint(address(router), 1_000_000e6);
        vm.startPrank(owner);
        usdy.approve(address(vault), 1_000e18);
        vault.deposit(1_000e18);
        vm.stopPrank();
    }

    function _swapParams(uint256 amountIn, uint256 amountOutMin)
        internal
        view
        returns (bytes memory)
    {
        address[] memory path = new address[](2);
        path[0] = address(usdy);
        path[1] = address(usdc);
        return abi.encode(amountIn, amountOutMin, path);
    }

    function test_agentSwapsToSafeAndAttests() public {
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE,
            _swapParams(100e18, 98e6),
            Regime.EARLY_DEPEG,
            bytes32("early-exit"),
            keccak256("signals")
        );
        assertEq(usdc.balanceOf(address(vault)), 100e6); // 1:1 mock rate
        assertEq(att.decisionCount(address(vault)), 1);
        (,, Regime regime,,, ActionType action, int256 outcome) = att.decisionAt(address(vault), 0);
        assertEq(uint8(regime), uint8(Regime.EARLY_DEPEG));
        assertEq(uint8(action), uint8(ActionType.SWAP_TO_SAFE));
        assertEq(outcome, int256(100e6));
    }

    function test_strangerCannotExecute() public {
        vm.expectRevert(SolventVault.NotAgent.selector);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, _swapParams(100e18, 98e6),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }

    function test_disallowedActionReverts() public {
        // policy only allows SWAP_TO_SAFE
        vm.expectRevert(
            abi.encodeWithSelector(SolventVault.ActionNotAllowed.selector, ActionType.PARK_YIELD)
        );
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.PARK_YIELD, "", Regime.CALM, bytes32("park"), bytes32(0)
        );
    }

    function test_killSwitchBlocksAgent() public {
        vm.prank(owner);
        vault.setKillSwitch(true);
        vm.expectRevert(SolventVault.Killed.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, _swapParams(100e18, 98e6),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }

    function test_swapBelowSlippageFloorReverts() public {
        // floor = 100e18 * (10000-300)/10000 -> 97e6; ask for 96e6 -> reverts
        vm.expectRevert(SolventVault.SlippageFloorBreached.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, _swapParams(100e18, 96e6),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }

    function test_swapToNonSafeAssetReverts() public {
        MockERC20 other = new MockERC20("OTHER", "OTH", 6);
        address[] memory path = new address[](2);
        path[0] = address(usdy);
        path[1] = address(other);
        vm.expectRevert(SolventVault.BadSwapPath.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, abi.encode(uint256(100e18), uint256(98e6), path),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SolventVaultSwapTest -vvv`
Expected: FAIL — `setDexRouter` / `executeProtectiveAction` / new errors don't exist.

- [ ] **Step 3: Extend `SolventVault.sol`**

Add the router import, field, setter, the dispatcher, the swap handler, and the new errors/events. Insert the import near the top:
```solidity
import {IDexRouter} from "./interfaces/IDexRouter.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
```

Add to the errors/events block:
```solidity
    error SlippageFloorBreached();
    error BadSwapPath();

    event DexRouterChanged(address indexed router);
    event ProtectiveActionExecuted(ActionType indexed action, int256 outcome);
```

Add a state field (next to `policy`):
```solidity
    IDexRouter public dexRouter;
```

Add the setter (next to the other owner setters):
```solidity
    function setDexRouter(address router) external onlyOwner {
        dexRouter = IDexRouter(router);
        emit DexRouterChanged(router);
    }
```

Add the dispatcher + swap handler (new `// --- agent surface ---` section):
```solidity
    function executeProtectiveAction(
        ActionType action,
        bytes calldata params,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash
    ) external onlyAgent nonReentrant {
        if (killSwitch) revert Killed();
        if (!policy.isActionAllowed(action)) revert ActionNotAllowed(action);

        int256 outcome;
        if (action == ActionType.SWAP_TO_SAFE) {
            outcome = _swapToSafe(params);
        } else {
            // Other actions are wired up in later tasks.
            revert ActionNotAllowed(action);
        }

        emit ProtectiveActionExecuted(action, outcome);
        attestation.record(agentId, regime, reasonCode, signalsHash, action, outcome);
    }

    /// @dev Enforces: output token is the policy safe asset, and amountOutMin
    /// is not below the policy slippage floor (assuming a 1:1 nominal peg
    /// between asset and safe stable). Returns safe-asset units received.
    function _swapToSafe(bytes calldata params) internal returns (int256) {
        (uint256 amountIn, uint256 amountOutMin, address[] memory path) =
            abi.decode(params, (uint256, uint256, address[]));

        if (path.length < 2 || path[0] != address(asset) || path[path.length - 1] != policy.safeAsset) {
            revert BadSwapPath();
        }

        uint8 ad = IERC20Metadata(address(asset)).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 floor = (amountIn * (10000 - policy.maxSlippageBps) * (10 ** sd)) / (10000 * (10 ** ad));
        if (amountOutMin < floor) revert SlippageFloorBreached();

        IERC20(address(asset)).forceApprove(address(dexRouter), amountIn);
        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        dexRouter.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);
        uint256 received = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        return int256(received);
    }
```

(`forceApprove` is provided by `SafeERC20`, already imported and `using`-bound to `IERC20` in Task 5.)

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SolventVaultSwapTest -vvv`
Expected: all six tests PASS. Then run the full suite: `forge test -vvv` — everything green.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/SolventVault.sol contracts/test/SolventVaultActions.t.sol
git commit -m "feat(contracts): add protective-action dispatch and swap-to-safe handler"
```

---

## Task 7: BRIDGE_VIA_LENDING and UNWIND_BRIDGE handlers

**Files:**
- Modify: `contracts/src/SolventVault.sol` (add bridge/unwind handlers + dispatch arms)
- Modify: `contracts/test/SolventVaultActions.t.sol` (add a bridge test contract)

- [ ] **Step 1: Write the failing test**

Append to `contracts/test/SolventVaultActions.t.sol`:
```solidity
import {MockLendingVenue} from "./mocks/MockLendingVenue.sol";

contract SolventVaultBridgeTest is Test {
    SolventVault vault;
    SolventAttestation att;
    MockERC20 usdy;
    MockERC20 usdc;
    MockLendingVenue venue;

    address owner = address(0xA11CE);
    address agent = address(0xA6E27);

    function _policy() internal view returns (Policy memory p) {
        p.safeAsset = address(usdc);
        p.bridgeVenue = address(venue);
        p.maxBridgeLTVBps = 5000; // 50%
        p.allowedActions =
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE));
    }

    function setUp() public {
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        venue = new MockLendingVenue();
        att = new SolventAttestation();

        vm.prank(owner);
        vault = new SolventVault(address(usdy), owner, agent, 42, address(att), _policy());

        usdy.mint(owner, 1_000e18);
        usdc.mint(address(venue), 1_000_000e6); // borrowable liquidity
        vm.startPrank(owner);
        usdy.approve(address(vault), 1_000e18);
        vault.deposit(1_000e18);
        vm.stopPrank();
    }

    function test_bridgeSuppliesCollateralAndBorrowsSafe() public {
        // supply 200 USDY, borrow 100 USDC (= 50% LTV, exactly at cap)
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(uint256(200e18), uint256(100e6)),
            Regime.EARLY_DEPEG, bytes32("bridge"), keccak256("sig")
        );
        assertEq(venue.supplied(address(vault), address(usdy)), 200e18);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
        assertEq(att.decisionCount(address(vault)), 1);
    }

    function test_bridgeBeyondMaxLTVReverts() public {
        // borrow 101 USDC against 200 USDY -> > 50% -> revert
        vm.expectRevert(SolventVault.BorrowExceedsMaxLTV.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(uint256(200e18), uint256(101e6)),
            Regime.EARLY_DEPEG, bytes32("bridge"), bytes32(0)
        );
    }

    function test_unwindRepaysAndWithdraws() public {
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(uint256(200e18), uint256(100e6)),
            Regime.EARLY_DEPEG, bytes32("bridge"), bytes32(0)
        );
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.UNWIND_BRIDGE,
            abi.encode(uint256(100e6), uint256(200e18)),
            Regime.CALM, bytes32("unwind"), bytes32(0)
        );
        assertEq(venue.supplied(address(vault), address(usdy)), 0);
        assertEq(venue.borrowed(address(vault), address(usdc)), 0);
        assertEq(usdy.balanceOf(address(vault)), 1_000e18); // collateral back
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SolventVaultBridgeTest -vvv`
Expected: FAIL — `BorrowExceedsMaxLTV` and the bridge dispatch arms don't exist.

- [ ] **Step 3: Extend `SolventVault.sol`**

Add the import near the top:
```solidity
import {ILendingVenue} from "./interfaces/ILendingVenue.sol";
```

Add to the errors block:
```solidity
    error BorrowExceedsMaxLTV();
```

Add two arms to the `if/else` chain in `executeProtectiveAction`, before the final `else`:
```solidity
        } else if (action == ActionType.BRIDGE_VIA_LENDING) {
            outcome = _bridgeViaLending(params);
        } else if (action == ActionType.UNWIND_BRIDGE) {
            outcome = _unwindBridge(params);
```

Add the two handlers in the agent-surface section:
```solidity
    /// @dev Supplies `asset` collateral to the policy bridge venue and borrows
    /// the safe asset, capped at maxBridgeLTV (1:1 nominal peg assumption).
    /// Returns safe-asset units borrowed.
    function _bridgeViaLending(bytes calldata params) internal returns (int256) {
        (uint256 collateralAmount, uint256 borrowAmount) = abi.decode(params, (uint256, uint256));
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        uint8 ad = IERC20Metadata(address(asset)).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 maxBorrow =
            (collateralAmount * policy.maxBridgeLTVBps * (10 ** sd)) / (10000 * (10 ** ad));
        if (borrowAmount > maxBorrow) revert BorrowExceedsMaxLTV();

        IERC20(address(asset)).forceApprove(address(venue), collateralAmount);
        venue.supply(address(asset), collateralAmount, address(this));
        venue.borrow(policy.safeAsset, borrowAmount, address(this));
        return int256(borrowAmount);
    }

    /// @dev Repays safe-asset debt and withdraws collateral back into the vault.
    /// Returns collateral units withdrawn (as a positive outcome).
    function _unwindBridge(bytes calldata params) internal returns (int256) {
        (uint256 repayAmount, uint256 withdrawAmount) = abi.decode(params, (uint256, uint256));
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        IERC20(policy.safeAsset).forceApprove(address(venue), repayAmount);
        venue.repay(policy.safeAsset, repayAmount, address(this));
        venue.withdraw(address(asset), withdrawAmount, address(this));
        return int256(withdrawAmount);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SolventVaultBridgeTest -vvv`
Expected: all three tests PASS. Then `forge test -vvv` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/SolventVault.sol contracts/test/SolventVaultActions.t.sol
git commit -m "feat(contracts): add liquidity-bridge and unwind handlers with LTV cap"
```

---

## Task 8: PARK_YIELD handler and observation attestation

**Files:**
- Modify: `contracts/src/SolventVault.sol` (yield venue config, `_parkYield`, dispatch arm, `attestObservation`)
- Modify: `contracts/test/SolventVaultActions.t.sol` (add a park/observe test contract)

- [ ] **Step 1: Write the failing test**

Append to `contracts/test/SolventVaultActions.t.sol`:
```solidity
contract SolventVaultParkTest is Test {
    SolventVault vault;
    SolventAttestation att;
    MockERC20 usdy;
    MockERC20 usdc;
    MockLendingVenue yieldVenue;

    address owner = address(0xA11CE);
    address agent = address(0xA6E27);

    function _policy() internal view returns (Policy memory p) {
        p.safeAsset = address(usdc);
        p.allowedActions = uint32(1) << uint8(ActionType.PARK_YIELD);
    }

    function setUp() public {
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        yieldVenue = new MockLendingVenue();
        att = new SolventAttestation();

        vm.prank(owner);
        vault = new SolventVault(address(usdy), owner, agent, 42, address(att), _policy());
        vm.prank(owner);
        vault.setYieldVenue(address(yieldVenue));

        usdy.mint(owner, 1_000e18);
        vm.startPrank(owner);
        usdy.approve(address(vault), 1_000e18);
        vault.deposit(1_000e18);
        vm.stopPrank();
    }

    function test_parkYieldSuppliesToYieldVenue() public {
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.PARK_YIELD, abi.encode(uint256(300e18)),
            Regime.CALM, bytes32("park"), keccak256("sig")
        );
        assertEq(yieldVenue.supplied(address(vault), address(usdy)), 300e18);
        assertEq(att.decisionCount(address(vault)), 1);
    }

    function test_observationAttestsWithoutMovingFunds() public {
        vm.prank(agent);
        vault.attestObservation(Regime.WATCH, bytes32("watch"), keccak256("sig"));
        assertEq(usdy.balanceOf(address(vault)), 1_000e18); // untouched
        (,, Regime regime,,, ActionType action,) = att.decisionAt(address(vault), 0);
        assertEq(uint8(regime), uint8(Regime.WATCH));
        assertEq(uint8(action), uint8(ActionType.NONE));
    }

    function test_strangerCannotAttestObservation() public {
        vm.expectRevert(SolventVault.NotAgent.selector);
        vault.attestObservation(Regime.WATCH, bytes32("x"), bytes32(0));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract SolventVaultParkTest -vvv`
Expected: FAIL — `setYieldVenue` / `attestObservation` / PARK arm don't exist.

- [ ] **Step 3: Extend `SolventVault.sol`**

Add a state field (next to `dexRouter`):
```solidity
    ILendingVenue public yieldVenue;
```

Add an event (to the events block):
```solidity
    event YieldVenueChanged(address indexed venue);
```

Add the setter (with the other owner setters):
```solidity
    function setYieldVenue(address venue) external onlyOwner {
        yieldVenue = ILendingVenue(venue);
        emit YieldVenueChanged(venue);
    }
```

Add a dispatch arm before the final `else` in `executeProtectiveAction`:
```solidity
        } else if (action == ActionType.PARK_YIELD) {
            outcome = _parkYield(params);
```

Add the handler and the observation function in the agent-surface section:
```solidity
    /// @dev Parks idle capital by supplying `asset` to the configured yield
    /// venue. Returns supplied units.
    function _parkYield(bytes calldata params) internal returns (int256) {
        uint256 amount = abi.decode(params, (uint256));
        IERC20(address(asset)).forceApprove(address(yieldVenue), amount);
        yieldVenue.supply(address(asset), amount, address(this));
        return int256(amount);
    }

    /// @notice Records a no-action observation (e.g. WATCH regime) to the
    /// attestation log without moving funds.
    function attestObservation(Regime regime, bytes32 reasonCode, bytes32 signalsHash)
        external
        onlyAgent
    {
        attestation.record(agentId, regime, reasonCode, signalsHash, ActionType.NONE, 0);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract SolventVaultParkTest -vvv`
Expected: all three tests PASS. Then `forge test -vvv` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/SolventVault.sol contracts/test/SolventVaultActions.t.sol
git commit -m "feat(contracts): add park-yield handler and observation attestation"
```

---

## Task 9: Deploy script for Mantle

**Files:**
- Create: `contracts/script/Deploy.s.sol`
- Create: `contracts/test/Deploy.t.sol`

- [ ] **Step 1: Write the failing test (deploy logic exercised against mocks)**

`contracts/test/Deploy.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventDeployLib} from "../script/Deploy.s.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract DeployTest is Test {
    function test_deployRegistersIdentityAndWiresVault() public {
        MockERC20 usdy = new MockERC20("USDY", "USDY", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockIdentityRegistry registry = new MockIdentityRegistry();

        Policy memory p;
        p.maxSlippageBps = 300;
        p.safeAsset = address(usdc);
        p.maxBridgeLTVBps = 5000;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        (SolventVault vault, SolventAttestation att, uint256 agentId) =
            SolventDeployLib.deploy(
                address(registry),
                "ipfs://solvent-agent",
                address(usdy),
                address(this), // owner
                address(this), // agent
                p
            );

        assertEq(agentId, 1);
        assertEq(vault.agentId(), 1);
        assertEq(registry.ownerOf(agentId), address(this));
        assertEq(address(vault.attestation()), address(att));
        assertEq(address(vault.asset()), address(usdy));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract DeployTest -vvv`
Expected: FAIL — `Deploy.s.sol` / `SolventDeployLib` does not exist.

- [ ] **Step 3: Write the deploy script + library**

`contracts/script/Deploy.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {Policy, ActionType} from "../src/Policy.sol";

/// @dev Pure deployment logic, unit-testable without broadcasting.
library SolventDeployLib {
    function deploy(
        address identityRegistry,
        string memory agentURI,
        address asset,
        address owner,
        address agent,
        Policy memory policy
    ) internal returns (SolventVault vault, SolventAttestation attestation, uint256 agentId) {
        agentId = IIdentityRegistry(identityRegistry).register(agentURI);
        attestation = new SolventAttestation();
        vault = new SolventVault(asset, owner, agent, agentId, address(attestation), policy);
    }
}

/// @notice `forge script` entrypoint. Reads config from env (see .env.example).
/// NOTE: confirm Mantle addresses on MantleScan before broadcasting (Task 9 open items).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY_ADDRESS");
        address asset = vm.envAddress("ASSET_ADDRESS");
        address safeAsset = vm.envAddress("SAFE_ASSET_ADDRESS");
        address dexRouter = vm.envAddress("DEX_ROUTER_ADDRESS");
        address bridgeVenue = vm.envAddress("BRIDGE_VENUE_ADDRESS");
        address yieldVenue = vm.envAddress("YIELD_VENUE_ADDRESS");
        address deployer = vm.addr(pk);

        Policy memory p;
        p.earlyDivergenceBps = 50;       // 0.5%
        p.terminalDivergenceBps = 500;   // 5%
        p.liquidityFloor = 0;            // tuned later by the agent config
        p.maxSlippageBps = 300;          // 3%
        p.safeAsset = safeAsset;
        p.bridgeVenue = bridgeVenue;
        p.maxBridgeLTVBps = 5000;        // 50%
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        vm.startBroadcast(pk);
        (SolventVault vault,, uint256 agentId) =
            SolventDeployLib.deploy(identityRegistry, "ipfs://solvent-agent", asset, deployer, deployer, p);
        vault.setDexRouter(dexRouter);
        vault.setYieldVenue(yieldVenue);
        vm.stopBroadcast();

        // forge prints these; capture for the dashboard + submission.
        // vault, vault.attestation(), agentId
        agentId; // silence unused in some compiler settings
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `forge test --match-contract DeployTest -vvv`
Expected: PASS. Then `forge test -vvv` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add contracts/script/Deploy.s.sol contracts/test/Deploy.t.sol
git commit -m "feat(contracts): add Mantle deploy script with unit-tested deploy library"
```

---

## Open items to resolve before mainnet broadcast (not part of unit tests)

These are real actions for the integration phase (next plan), not code placeholders:

- Confirm Mantle mainnet addresses on MantleScan and fill `.env`: USDY (`ASSET_ADDRESS`), USDC/USDT0 (`SAFE_ASSET_ADDRESS`), a DEX router for the USDY/safe pair (`DEX_ROUTER_ADDRESS`), the lending venue for USDY (`BRIDGE_VENUE_ADDRESS` — likely INIT Capital), a yield venue (`YIELD_VENUE_ADDRESS`).
- Confirm the deployed ERC-8004 Identity Registry on Mantle, or deploy the reference Identity Registry ourselves and set `IDENTITY_REGISTRY_ADDRESS`.
- Real `ILendingVenue` / `IDexRouter` adapters (Aave V3 `IPool`, INIT Capital, the chosen DEX) are implemented and fork-tested in the next plan (agent + integration).

---

## Self-Review

**Spec coverage (contracts portion of `2026-05-27-solvent-design.md`):**
- §7 SolventVault (roles, deposit/withdraw, setters, kill switch, `executeProtectiveAction`, on-chain policy bounds, handlers `_swapToSafe`/`_bridgeViaLending`/`_unwindBridge`/`_parkYield`, events) → Tasks 5–8. ✓
- §7 Policy struct (all fields) → Task 2. ✓ (on-chain-enforced fields: maxSlippageBps in Task 6, maxBridgeLTVBps in Task 7, safeAsset/bridgeVenue/allowedActions throughout; off-chain fields stored for verifiability.)
- §7 SolventAttestation + ERC-8004 identity → Task 4 (log) + Task 9 (Identity Registry registration). Refinement noted in plan intro: decision log is our own contract keyed by ERC-8004 `agentId`; Validation/Reputation bridge is out of this plan (stretch). ✓
- §9 safety invariants enforceable on-chain (agent can't withdraw, kill switch, slippage floor, LTV cap, action allow-list) → Tasks 5–8 tests. ✓ (Liquidity-trap simulation, oracle cross-check, NAV staleness live in the off-chain agent — next plan.)
- §10 contract tests (access control, policy-bound enforcement, each handler) → Tasks 5–8. Fuzz/property tests deferred to a hardening task in the integration plan (noted; basic invariants covered by unit tests here).

**Placeholder scan:** No TBD/TODO in code steps; every step has complete code and exact commands. The "Open items" section lists real integration actions, not code gaps.

**Type consistency:** `ActionType`/`Regime` enums defined in Task 2 used consistently; `Policy` fields referenced in Tasks 6–9 match Task 2; `executeProtectiveAction(action, params, regime, reasonCode, signalsHash)` signature is identical across Tasks 6/7/8 tests; `SolventAttestation.record(agentId, regime, reasonCode, signalsHash, action, outcome)` matches between Task 4 and the vault calls; error selectors (`NotOwner`, `NotAgent`, `Killed`, `ActionNotAllowed`, `SlippageFloorBreached`, `BadSwapPath`, `BorrowExceedsMaxLTV`) defined before use. ✓
