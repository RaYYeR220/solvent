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
