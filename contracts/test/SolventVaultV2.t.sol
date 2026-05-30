// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockDexRouterV2 as MockDexRouter} from "./mocks/MockDexRouterV2.sol";

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
            allowedActions: uint32(1) << uint8(ActionType.SWAP_TO_SAFE)
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

    function test_totalAssets_accountsForSafeBalanceAt1to1() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        assertEq(vault.totalAssets(), 100e6);

        // Simulate the vault holding 40 USDC after a partial swap.
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
        uint16, uint16, uint256, uint16, address, address, uint16, uint32
    ) {
        (
            uint16 a, uint16 b, uint256 c, uint16 d,
            address e, address f, uint16 g, uint32 h
        ) = vault.policy();
        return (a, b, c, d, e, f, g, h);
    }

    // --- mock DEX for SWAP_TO_SAFE tests ---
    function _seedMockDex() internal returns (MockDexRouter dex) {
        dex = new MockDexRouter();
        safe.mint(address(dex), 1_000_000e6); // pre-fund so it can pay out
        vm.prank(owner);
        vault.setDexRouter(address(dex));
    }

    function _assetAddr() internal view returns (address) {
        return address(vault.asset());
    }

    function test_executeProtectiveAction_swapToSafe_preservesShareValue() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6);

        address[] memory path = new address[](2);
        path[0] = _assetAddr();
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

        assertEq(IERC20(_assetAddr()).balanceOf(address(vault)), 0);
        assertEq(safe.balanceOf(address(vault)), 100e6);
        assertEq(vault.totalAssets(), 100e6);
        assertEq(vault.convertToAssets(vault.balanceOf(alice)), 100e6);
    }

    function test_executeProtectiveAction_killSwitchBlocks() public {
        vm.prank(owner);
        vault.setKillSwitch(true);

        address[] memory path = new address[](2);
        path[0] = _assetAddr(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(1e6), uint256(0), path);

        vm.prank(agent);
        vm.expectRevert(SolventVaultV2.Killed.selector);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.CALM, bytes32(0), bytes32(0), ""
        );
    }

    function test_executeProtectiveAction_onlyAgent() public {
        address[] memory path = new address[](2);
        path[0] = _assetAddr(); path[1] = address(safe);
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

        vm.prank(agent);
        vault.attestObservation(Regime.WATCH, keccak256("observe"), bytes32(0), "");
        assertEq(att.decisionCount(address(vault)), 1);
    }

    function test_redeem_burnsShares_returnsAsset() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);

        uint256 assetsOut = vault.redeem(50e6, alice, alice);
        vm.stopPrank();

        assertEq(assetsOut, 50e6);
        assertEq(asset.balanceOf(alice), 50e6);
        assertEq(vault.balanceOf(alice), 50e6);
    }

    function test_redeem_revertsWhenInsufficientAssetBalance() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6);
        address[] memory path = new address[](2);
        path[0] = _assetAddr(); path[1] = address(safe);
        bytes memory params = abi.encode(uint256(100e6), uint256(99e6), path);
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.SWAP_TO_SAFE, params, Regime.EARLY_DEPEG,
            keccak256("early-exit"), bytes32(0), ""
        );

        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(50e6, alice, alice);
    }

    function test_redeemAll_returnsProRataMix() public {
        asset.mint(alice, 100e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        MockDexRouter dex = _seedMockDex();
        dex.setRate(1e6, 1e6);
        address[] memory path = new address[](2);
        path[0] = _assetAddr(); path[1] = address(safe);
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
        asset.mint(alice, 10e6);
        vm.startPrank(alice);
        asset.approve(address(vault), 10e6);
        vault.deposit(10e6, alice);
        vm.stopPrank();

        address assetAddr = address(asset);

        vm.prank(owner);
        vm.expectRevert(SolventVaultV2.NotKilled.selector);
        vault.rescue(assetAddr, 1e6, owner);

        vm.prank(owner);
        vault.setKillSwitch(true);

        vm.prank(address(0xDEAD));
        vm.expectRevert(SolventVaultV2.NotOwner.selector);
        vault.rescue(assetAddr, 1e6, address(0xDEAD));

        vm.prank(owner);
        vault.rescue(assetAddr, 1e6, owner);
        assertEq(asset.balanceOf(owner), 1e6);
    }
}
