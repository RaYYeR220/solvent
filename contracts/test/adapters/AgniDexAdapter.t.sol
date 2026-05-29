// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgniDexAdapter} from "../../src/adapters/AgniDexAdapter.sol";
import {MockAgniSwapRouter} from "../mocks/MockAgniSwapRouter.sol";
import {MockAgniQuoterV2} from "../mocks/MockAgniQuoterV2.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract AgniDexAdapterTest is Test {
    MockAgniSwapRouter router;
    MockAgniQuoterV2 quoter;
    MockERC20 tokenIn;
    MockERC20 tokenOut;
    AgniDexAdapter adapter;
    address caller = address(0xCA11);

    function setUp() public {
        router = new MockAgniSwapRouter();
        quoter = new MockAgniQuoterV2();
        tokenIn = new MockERC20("In", "IN", 18);
        tokenOut = new MockERC20("Out", "OUT", 6);
        adapter = new AgniDexAdapter(address(router), address(quoter), 3000);

        // Seed router with tokenOut so it can pay out.
        tokenOut.mint(address(router), 1_000_000e6);
        // 1 IN (18 dec) -> 0.99 OUT (6 dec): num = 0.99e6, denom = 1e18
        router.setRate(99e4, 1e18);
    }

    function test_swapExactTokensForTokensSingleHop() public {
        tokenIn.mint(caller, 1e18);
        vm.startPrank(caller);
        tokenIn.approve(address(adapter), 1e18);

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        uint256[] memory amounts = adapter.swapExactTokensForTokens(1e18, 0.98e6, path, caller, block.timestamp);
        vm.stopPrank();

        assertEq(amounts.length, 2);
        assertEq(amounts[0], 1e18);
        assertEq(amounts[1], 0.99e6);
        assertEq(tokenOut.balanceOf(caller), 0.99e6);
    }

    function test_revertsOnNonSingleHopPath() public {
        tokenIn.mint(caller, 1e18);
        vm.startPrank(caller);
        tokenIn.approve(address(adapter), 1e18);

        address[] memory path = new address[](3);
        path[0] = address(tokenIn);
        path[1] = address(0xDEADBEEF);
        path[2] = address(tokenOut);

        vm.expectRevert(AgniDexAdapter.MultiHopUnsupported.selector);
        adapter.swapExactTokensForTokens(1e18, 0, path, caller, block.timestamp);
        vm.stopPrank();
    }

    function test_revertsOnBelowAmountOutMin() public {
        tokenIn.mint(caller, 1e18);
        vm.startPrank(caller);
        tokenIn.approve(address(adapter), 1e18);

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        vm.expectRevert(bytes("MockAgniSwapRouter: under min"));
        adapter.swapExactTokensForTokens(1e18, 1.5e6, path, caller, block.timestamp);
        vm.stopPrank();
    }
}
