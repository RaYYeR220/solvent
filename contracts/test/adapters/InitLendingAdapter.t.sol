// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {InitLendingAdapter} from "../../src/adapters/InitLendingAdapter.sol";
import {MockInitCore} from "../mocks/MockInitCore.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract InitLendingAdapterTest is Test {
    MockInitCore core;
    MockERC20 risk;   // collateral (e.g. USDY)
    MockERC20 safe;   // debt (e.g. USDC)
    InitLendingAdapter adapter;
    address vault = address(0xBADD);

    function setUp() public {
        core = new MockInitCore();
        risk = new MockERC20("USDY", "USDY", 18);
        safe = new MockERC20("USDC", "USDC", 6);
        adapter = new InitLendingAdapter(address(core), address(risk), address(safe));

        // Pre-fund the mock core with debt token so it can lend out.
        safe.mint(address(this), 1_000_000e6);
        safe.approve(address(core), 1_000_000e6);
        core.fundDebtToken(address(safe), 1_000_000e6);
    }

    function test_supplyOpensPositionAndCollateralises() public {
        risk.mint(vault, 100e18);
        vm.startPrank(vault);
        risk.approve(address(adapter), 100e18);
        adapter.supply(address(risk), 100e18, vault);
        vm.stopPrank();

        assertEq(adapter.posId(), 1);
        assertEq(risk.balanceOf(address(core)), 100e18);
    }

    function test_borrowSendsToOnBehalfOf() public {
        risk.mint(vault, 100e18);
        vm.startPrank(vault);
        risk.approve(address(adapter), 100e18);
        adapter.supply(address(risk), 100e18, vault);
        adapter.borrow(address(safe), 50e6, vault);
        vm.stopPrank();

        assertEq(safe.balanceOf(vault), 50e6);
    }

    function test_repayThenWithdraw() public {
        risk.mint(vault, 100e18);
        vm.startPrank(vault);
        risk.approve(address(adapter), 100e18);
        adapter.supply(address(risk), 100e18, vault);
        adapter.borrow(address(safe), 50e6, vault);

        safe.approve(address(adapter), 50e6);
        adapter.repay(address(safe), 50e6, vault);

        uint256 withdrawn = adapter.withdraw(address(risk), 100e18, vault);
        vm.stopPrank();

        assertEq(withdrawn, 100e18);
        assertEq(risk.balanceOf(vault), 100e18);
    }

    function test_supplyRejectsWrongAsset() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        other.mint(vault, 1e18);
        vm.startPrank(vault);
        other.approve(address(adapter), 1e18);
        vm.expectRevert(InitLendingAdapter.UnsupportedAsset.selector);
        adapter.supply(address(other), 1e18, vault);
        vm.stopPrank();
    }

    function test_borrowRejectsWrongAsset() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        vm.startPrank(vault);
        vm.expectRevert(InitLendingAdapter.UnsupportedAsset.selector);
        adapter.borrow(address(other), 1e6, vault);
        vm.stopPrank();
    }
}
