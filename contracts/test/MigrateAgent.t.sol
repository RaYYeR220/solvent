// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MigrateAgent} from "../script/MigrateAgent.s.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockIdentityRegistry is ERC721 {
    constructor() ERC721("ERC-8004 Identity", "ID") {}
    function mint(address to, uint256 tokenId) external { _mint(to, tokenId); }
}

contract MockERC20 is IERC20 {
    mapping(address => uint256) public override balanceOf;
    function totalSupply() external pure override returns (uint256) { return 0; }
    function allowance(address, address) external pure override returns (uint256) { return 0; }
    function approve(address, uint256) external pure override returns (bool) { return true; }
    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address, address, uint256) external pure override returns (bool) { return true; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
}

contract MigrateAgentTest is Test {
    MockIdentityRegistry registry;
    SolventAttestation attestation;
    SolventVault vault;
    MockERC20 asset;
    address deployer = address(0xD3);
    address newAgent = address(0xA6);
    uint256 constant AGENT_ID = 106;

    function setUp() public {
        registry = new MockIdentityRegistry();
        registry.mint(deployer, AGENT_ID);
        asset = new MockERC20();
        attestation = new SolventAttestation(address(0));
        Policy memory p = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: address(asset),
            bridgeVenue: address(0),
            maxBridgeLTVBps: 5000,
            allowedActions: uint32((1 << uint8(ActionType.PARK_YIELD)) | (1 << uint8(ActionType.SWAP_TO_SAFE)))
        });
        vault = new SolventVault(address(asset), deployer, deployer, AGENT_ID, address(attestation), p);
        vm.deal(deployer, 10 ether);
    }

    /// Simulates the three top-level calls that `MigrateAgent.run()` produces
    /// under `forge script --broadcast`: each external call is a separate tx
    /// from the deployer EOA, so we prank deployer per call.
    function _simulateMigration(address newAgent_, uint256 fundAmount_) internal {
        vm.prank(deployer);
        registry.transferFrom(deployer, newAgent_, AGENT_ID);
        vm.prank(deployer);
        vault.setAgent(newAgent_);
        if (fundAmount_ > 0) {
            vm.prank(deployer);
            (bool ok, ) = newAgent_.call{value: fundAmount_}("");
            require(ok, "fund transfer failed");
        }
    }

    function test_migration_transfers_nft_and_sets_agent() public {
        _simulateMigration(newAgent, 0);
        assertEq(registry.ownerOf(AGENT_ID), newAgent, "NFT must be owned by newAgent");
        assertEq(vault.agent(), newAgent, "vault.agent must be newAgent");
    }

    function test_migration_funds_new_agent_when_amount_nonzero() public {
        uint256 fundAmount = 6 ether;
        _simulateMigration(newAgent, fundAmount);
        assertEq(newAgent.balance, fundAmount, "newAgent must receive fundAmount native");
    }

    function test_migration_reverts_if_caller_not_owner() public {
        // Non-owner attempts vault.setAgent — must revert NotOwner.
        vm.prank(address(0xBAD));
        vm.expectRevert(SolventVault.NotOwner.selector);
        vault.setAgent(newAgent);
    }
}
