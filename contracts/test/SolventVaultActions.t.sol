// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockDexRouter} from "./mocks/MockDexRouter.sol";
import {MockLendingVenue} from "./mocks/MockLendingVenue.sol";

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
        // floor = (100e18 * (10000-300) * 10**6) / (10000 * 10**18) = 97e6; asking 96e6 reverts
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

    function test_swapFromNonAssetReverts() public {
        MockERC20 other = new MockERC20("OTHER", "OTH", 18);
        address[] memory path = new address[](2);
        path[0] = address(other); // not the vault asset
        path[1] = address(usdc);
        vm.expectRevert(SolventVault.BadSwapPath.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, abi.encode(uint256(100e18), uint256(98e6), path),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }

    function test_swapShortPathReverts() public {
        address[] memory path = new address[](1);
        path[0] = address(usdy);
        vm.expectRevert(SolventVault.BadSwapPath.selector);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, abi.encode(uint256(100e18), uint256(98e6), path),
            Regime.EARLY_DEPEG, bytes32("x"), bytes32(0)
        );
    }

    function test_setDexRouterRejectsZero() public {
        vm.expectRevert(SolventVault.ZeroAddress.selector);
        vm.prank(owner);
        vault.setDexRouter(address(0));
    }
}

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
