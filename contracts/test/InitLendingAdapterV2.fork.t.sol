// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InitLendingAdapterV2} from "../src/adapters/InitLendingAdapterV2.sol";

/// @notice Full ILendingVenue round-trip through InitLendingAdapterV2 against
/// real INIT Capital on a Mantle fork. This test contract plays the part of the
/// vault: it holds the underlying tokens (USDY collateral, USDC for repay) and
/// drives the adapter purely through the ILendingVenue UNDERLYING-token facade.
///
/// Mirrors the mint/borrow UNPAUSE storage cheats pinned in InitFork.t.sol —
/// INIT has mint (INC#400) and borrow (INC#402) operationally paused
/// protocol-wide at this block (transient guardian pause, not a structural
/// rejection of USDY); we flip the flags back on to mirror INIT's normal state.
contract InitLendingAdapterV2ForkTest is Test {
    // INIT Capital (Mantle mainnet)
    address constant CORE = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5;
    address constant POS_MANAGER = 0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92;
    address constant CONFIG = 0x007F91636E0f986068Ef27c950FA18734BA553Ac;
    address constant INUSDY = 0xf084813F1be067d980a0171F067f084f27B3F63A; // underlying USDY
    address constant INUSDC = 0x00A55649E597d463fD212fBE48a3B40f0E227d06; // underlying USDC

    // Tokens
    address constant USDY = 0x5bE26527e817998A7206475496fDE1E68957c5A6; // 18 dec (collateral)
    address constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9; // 6 dec  (borrow)

    uint16 constant MODE = 1;

    InitLendingAdapterV2 adapter;

    function setUp() public {
        try vm.createSelectFork("https://rpc.mantle.xyz") {
            _unpauseMint(INUSDY);
            _unpauseMint(INUSDC);
            _unpauseModeBorrow(MODE);
        } catch {
            vm.skip(true);
        }

        adapter = new InitLendingAdapterV2(CORE, POS_MANAGER, INUSDY, INUSDC, USDY, USDC);
    }

    /// @notice supply -> borrow -> repay -> withdraw, asserting the collateral
    /// and debt VIEWS report the expected UNDERLYING amounts/decimals at each step.
    function test_v2_roundtrip_through_ilendingvenue() public {
        // Sanity: views are zero with no position.
        assertEq(adapter.collateralUnderlying(), 0, "coll starts 0");
        assertEq(adapter.debtUnderlying(), 0, "debt starts 0");

        // ---- supply 500 USDY (this contract == the "vault" caller) ----
        uint256 supplyAmt = 500e18;
        deal(USDY, address(this), supplyAmt);
        IERC20(USDY).approve(address(adapter), supplyAmt);
        adapter.supply(USDY, supplyAmt, address(this));

        uint256 posId = adapter.posId();
        assertGt(posId, 0, "position opened");
        assertEq(IERC20(USDY).balanceOf(address(this)), 0, "USDY pulled by adapter");

        uint256 coll = adapter.collateralUnderlying();
        assertApproxEqRel(coll, supplyAmt, 0.01e18, "collateral ~= 500 USDY (18 dec)");
        console.log("collateralUnderlying after supply (1e18):", coll);

        // ---- borrow 200 USDC to this contract ----
        uint256 borrowAmt = 200e6;
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));
        adapter.borrow(USDC, borrowAmt, address(this));
        uint256 usdcAfter = IERC20(USDC).balanceOf(address(this));

        assertEq(usdcAfter - usdcBefore, borrowAmt, "received exactly 200 USDC");
        uint256 debt = adapter.debtUnderlying();
        assertApproxEqAbs(debt, borrowAmt, 1e6, "debt ~= 200 USDC (6 dec)");
        console.log("debtUnderlying after borrow (1e6):", debt);

        // ---- repay full debt ----
        // Top up a tiny USDC buffer for any accrued dust, then repay generously.
        uint256 repayBudget = debt + 5e6;
        deal(USDC, address(this), repayBudget);
        IERC20(USDC).approve(address(adapter), repayBudget);
        uint256 repaid = adapter.repay(USDC, repayBudget, address(this));
        assertGt(repaid, 0, "repaid > 0");
        console.log("repaid USDC (1e6):", repaid);

        assertEq(adapter.debtUnderlying(), 0, "debt cleared after repay");
        // Unspent USDC is handed back to the caller.
        assertGt(IERC20(USDC).balanceOf(address(this)), 0, "leftover USDC returned");

        // ---- withdraw all collateral ----
        uint256 usdyBefore = IERC20(USDY).balanceOf(address(this));
        uint256 withdrawn = adapter.withdraw(USDY, type(uint256).max, address(this));
        uint256 usdyBack = IERC20(USDY).balanceOf(address(this)) - usdyBefore;

        assertApproxEqRel(withdrawn, supplyAmt, 0.01e18, "withdrew ~= 500 USDY");
        assertEq(usdyBack, withdrawn, "USDY landed with caller");
        assertEq(adapter.collateralUnderlying(), 0, "collateral cleared after withdraw");
        console.log("withdrawn USDY (1e18):", withdrawn);
    }

    /// @notice A partial borrow + partial repay keeps a consistent debt view.
    function test_v2_partial_repay_leaves_residual_debt() public {
        uint256 supplyAmt = 500e18;
        deal(USDY, address(this), supplyAmt);
        IERC20(USDY).approve(address(adapter), supplyAmt);
        adapter.supply(USDY, supplyAmt, address(this));

        adapter.borrow(USDC, 200e6, address(this));
        uint256 debt0 = adapter.debtUnderlying();
        assertApproxEqAbs(debt0, 200e6, 1e6, "debt ~200");

        // Repay 120 USDC of the ~200 debt.
        deal(USDC, address(this), 120e6);
        IERC20(USDC).approve(address(adapter), 120e6);
        uint256 repaid = adapter.repay(USDC, 120e6, address(this));
        assertApproxEqAbs(repaid, 120e6, 1e6, "repaid ~120");

        uint256 debt1 = adapter.debtUnderlying();
        assertApproxEqAbs(debt1, debt0 - 120e6, 2e6, "residual ~80 USDC");
        console.log("residual debt after partial repay (1e6):", debt1);

        // Clean up: full repay + withdraw so we leave no open position dust.
        deal(USDC, address(this), debt1 + 5e6);
        IERC20(USDC).approve(address(adapter), debt1 + 5e6);
        adapter.repay(USDC, debt1 + 5e6, address(this));
        adapter.withdraw(USDY, type(uint256).max, address(this));
        assertEq(adapter.debtUnderlying(), 0, "debt cleared");
        assertEq(adapter.collateralUnderlying(), 0, "coll cleared");
    }

    // ----------------------------- ERC721 sink ----------------------------

    /// @dev The adapter mints the position NFT to itself; deploying it here is
    /// fine, but `deal`/transfers never route an NFT to this test. Kept for
    /// parity in case future flows mint to the caller.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
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
