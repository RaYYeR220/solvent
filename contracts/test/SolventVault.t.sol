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

    function test_strangerCannotWithdraw() public {
        vm.prank(owner);
        usdy.approve(address(vault), 100e18);
        vm.prank(owner);
        vault.deposit(100e18);

        vm.expectRevert(SolventVault.NotOwner.selector);
        vm.prank(stranger);
        vault.withdraw(1e18);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(SolventVault.ZeroAddress.selector);
        new SolventVault(address(usdy), address(0), agent, 42, address(att), _basePolicy());

        vm.expectRevert(SolventVault.ZeroAddress.selector);
        new SolventVault(address(0), owner, agent, 42, address(att), _basePolicy());

        vm.expectRevert(SolventVault.ZeroAddress.selector);
        new SolventVault(address(usdy), owner, agent, 42, address(0), _basePolicy());
    }
}
