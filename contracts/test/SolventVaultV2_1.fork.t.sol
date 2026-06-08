// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SolventVaultV2_1} from "../src/SolventVaultV2_1.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {InitLendingAdapterV2} from "../src/adapters/InitLendingAdapterV2.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";

/// @notice FULL-STACK fork integration: SolventVaultV2_1 (INIT-aware
/// totalAssets) + the real InitLendingAdapterV2, driven through the real
/// agent surface against live INIT Capital on a Mantle fork.
///
/// The whole point: prove that a `BRIDGE_VIA_LENDING` (move USDY into INIT as
/// collateral, borrow USDC out) and the matching `UNWIND_BRIDGE` both PRESERVE
/// `totalAssets()` (hence share price), because the bridged INIT position is
/// valued by the vault's overridden `totalAssets()` via the adapter's
/// collateral/debt views.
///
/// This test plays the agent (it is set as the vault's `agent`). It mirrors the
/// mint/borrow UNPAUSE storage cheats pinned in InitFork.t.sol — INIT has mint
/// (INC#400) and borrow (INC#402) operationally paused protocol-wide at this
/// block (a transient guardian pause, not a structural rejection of USDY).
contract SolventVaultV2_1ForkTest is Test {
    // INIT Capital (Mantle mainnet)
    address constant CORE = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5;
    address constant POS_MANAGER = 0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92;
    address constant CONFIG = 0x007F91636E0f986068Ef27c950FA18734BA553Ac;
    address constant INUSDY = 0xf084813F1be067d980a0171F067f084f27B3F63A; // underlying USDY
    address constant INUSDC = 0x00A55649E597d463fD212fBE48a3B40f0E227d06; // underlying USDC

    // Tokens
    address constant USDY = 0x5bE26527e817998A7206475496fDE1E68957c5A6; // 18 dec (collateral / asset)
    address constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9; // 6 dec  (borrow / safeAsset)

    uint16 constant MODE = 1;
    uint256 constant AGENT_ID = 106;
    uint256 constant DEPOSIT = 500e18; // 500 USDY

    SolventVaultV2_1 vault;
    SolventAttestation att;
    InitLendingAdapterV2 adapter;

    address owner = address(0xA11CE);
    // This test contract is the agent (so it can call executeProtectiveAction).

    function _policy() internal view returns (Policy memory) {
        return Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: USDC,
            bridgeVenue: address(adapter),
            maxBridgeLTVBps: 5000, // 50%
            allowedActions: (uint32(1) << uint8(ActionType.SWAP_TO_SAFE))
                | (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING))
                | (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) // = 14
        });
    }

    function setUp() public {
        try vm.createSelectFork("https://rpc.mantle.xyz") {
            _unpauseMint(INUSDY);
            _unpauseMint(INUSDC);
            _unpauseModeBorrow(MODE);
        } catch {
            vm.skip(true);
        }

        adapter = new InitLendingAdapterV2(CORE, POS_MANAGER, INUSDY, INUSDC, USDY, USDC);
        att = new SolventAttestation(address(0));
        // agent = address(this) so this test can drive executeProtectiveAction.
        vault = new SolventVaultV2_1(USDY, owner, address(this), AGENT_ID, address(att), _policy());

        // Deposit 500 USDY into the vault.
        deal(USDY, address(this), DEPOSIT);
        IERC20(USDY).approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, address(this));
    }

    /// @dev If the vault holds the position NFT path nothing routes an NFT here;
    /// kept for parity with the adapter's createPos(viewer) flow.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @notice bridge then unwind on a real fork; assert totalAssets ≈ T0 at each
    /// step and that the adapter's position views go non-zero across the bridge.
    function test_fork_bridge_unwind_preservesTotalAssets() public {
        uint256 t0 = vault.totalAssets();
        assertApproxEqAbs(t0, DEPOSIT, 1, "T0 == deposit (no position yet)");
        assertEq(adapter.collateralUnderlying(), 0, "no coll pre-bridge");
        assertEq(adapter.debtUnderlying(), 0, "no debt pre-bridge");
        console.log("totalAssets T0       (1e18):", t0);

        // ---- BRIDGE: supply 500 USDY collateral, borrow USDC within LTV ----
        // 50% policy cap of 500 USDY. USDY ~ $1.135, so 500 USDY ~ $567 of value;
        // borrow 200 USDC stays well within both the policy cap and INIT health.
        uint256 collateral = DEPOSIT; // 500 USDY
        uint256 borrowAmt = 200e6; // 200 USDC (policy cap here is 250 USDC nominal)

        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(collateral, borrowAmt),
            Regime.EARLY_DEPEG,
            keccak256("bridge"),
            bytes32(0),
            "data:,bridge"
        );

        // Adapter views are non-zero and report the right underlying/decimals.
        uint256 collView = adapter.collateralUnderlying();
        uint256 debtView = adapter.debtUnderlying();
        assertApproxEqRel(collView, collateral, 0.01e18, "coll view ~= 500 USDY (18 dec)");
        assertApproxEqAbs(debtView, borrowAmt, 1e6, "debt view ~= 200 USDC (6 dec)");
        assertGt(collView, 0, "coll view non-zero");
        assertGt(debtView, 0, "debt view non-zero");
        console.log("coll view post-bridge(1e18):", collView);
        console.log("debt view post-bridge(1e6) :", debtView);

        // Vault composition: ~0 USDY left, 200 USDC borrowed in.
        assertApproxEqAbs(IERC20(USDY).balanceOf(address(vault)), 0, 1, "USDY moved to INIT");
        assertEq(IERC20(USDC).balanceOf(address(vault)), borrowAmt, "borrowed USDC in vault");

        uint256 t1 = vault.totalAssets();
        console.log("totalAssets afterBRIDGE(1e18):", t1);
        // Bridge must preserve value to within a few bps (INIT share-rounding on
        // mint + a stale-rate read in the view). A larger drift would be a bug.
        assertApproxEqRel(t1, t0, 0.005e18, "BRIDGE preserves totalAssets within 50bps");

        // ---- UNWIND: repay the full debt, withdraw all collateral ----
        // The debt accrues a hair above the 200 USDC borrowed, so a clean close
        // needs a tiny USDC top-up beyond the vault's 200 USDC. Seed a small
        // buffer into the vault (mirrors the vault being able to source dust;
        // here it slightly INCREASES totalAssets, which we account for below).
        uint256 buffer = 5e6;
        deal(USDC, address(vault), IERC20(USDC).balanceOf(address(vault)) + buffer);
        uint256 tBeforeUnwind = vault.totalAssets(); // T0 + buffer (in asset units)

        // Repay the vault's WHOLE USDC balance (200 borrowed + 5 buffer); this
        // exceeds the ~200.000001 USDC debt, so the adapter closes the position
        // fully and hands the unspent USDC back to the vault.
        uint256 repayAmt = IERC20(USDC).balanceOf(address(vault)); // covers full debt + accrual
        vault.executeProtectiveAction(
            ActionType.UNWIND_BRIDGE,
            abi.encode(repayAmt, type(uint256).max), // withdraw ALL collateral
            Regime.CALM,
            keccak256("unwind"),
            bytes32(0),
            "data:,unwind"
        );

        // Position cleared.
        assertEq(adapter.collateralUnderlying(), 0, "coll cleared after unwind");
        assertEq(adapter.debtUnderlying(), 0, "debt cleared after unwind");

        uint256 t2 = vault.totalAssets();
        console.log("totalAssets afterUNWIND(1e18):", t2);
        // Value preserved across the round-trip: t2 should match the pre-unwind
        // total (T0 + the injected buffer) minus only the few USDC of dust INIT
        // actually consumed to close the position.
        assertApproxEqRel(t2, tBeforeUnwind, 0.005e18, "UNWIND preserves totalAssets (vs pre-unwind) within 50bps");
        // Net of the buffer we injected, the vault is back to T0 within a few bps
        // (the ONLY real loss is INIT's borrow-interest dust on the closed loan).
        uint256 bufferInAsset = buffer * 1e12; // USDC(6) -> USDY(18) units
        assertApproxEqRel(t2 - bufferInAsset, t0, 0.005e18, "round-trip preserves T0 (net of buffer) within 50bps");

        // Sanity: after unwind the vault is back to (mostly) USDY plus any
        // leftover USDC dust; the USDY balance should be near the original.
        console.log("vault USDY afterUNWIND (1e18):", IERC20(USDY).balanceOf(address(vault)));
        console.log("vault USDC afterUNWIND (1e6) :", IERC20(USDC).balanceOf(address(vault)));
    }

    // --------------------------- unpause cheats ---------------------------
    // (verbatim from InitFork.t.sol — the pinned, fork-proven storage map)

    function _unpauseMint(address pool) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(pool, uint256(2)))) + 1);
        uint256 cur = uint256(vm.load(CONFIG, slot));
        vm.store(CONFIG, slot, bytes32(cur | 0x01));
    }

    function _unpauseModeBorrow(uint16 mode) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(uint256(mode), uint256(3)))) + 6);
        uint256 cur = uint256(vm.load(CONFIG, slot));
        vm.store(CONFIG, slot, bytes32(cur | (uint256(1) << 16)));
    }
}
