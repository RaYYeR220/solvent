// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ScaffoldTest is Test {
    function test_mockMintsWithDecimals() public {
        MockERC20 token18 = new MockERC20("USD Yield", "USDY", 18);
        token18.mint(address(this), 1e18);
        assertEq(token18.decimals(), 18);
        assertEq(token18.balanceOf(address(this)), 1e18);

        MockERC20 token6 = new MockERC20("USD Coin", "USDC", 6);
        token6.mint(address(this), 1e6);
        assertEq(token6.decimals(), 6);
        assertEq(token6.balanceOf(address(this)), 1e6);
    }
}
