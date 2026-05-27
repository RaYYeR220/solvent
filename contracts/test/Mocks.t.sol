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

    function test_dexRouterRevertsBelowAmountOutMin() public {
        MockERC20 usdy = new MockERC20("USDY", "USDY", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockDexRouter router = new MockDexRouter();
        usdy.mint(address(this), 100e18);
        usdc.mint(address(router), 1_000e6);
        usdy.approve(address(router), 100e18);
        address[] memory path = new address[](2);
        path[0] = address(usdy);
        path[1] = address(usdc);
        // 100e18 at 1:1 yields 100e6; demanding 101e6 must revert
        vm.expectRevert(bytes("MockDexRouter: insufficient output"));
        router.swapExactTokensForTokens(100e18, 101e6, path, address(this), block.timestamp);
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
