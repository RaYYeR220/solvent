// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "../script/MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Smoke test: deploy V2 on a Mantle mainnet fork, verify policy +
/// agent + adapter wiring read back correctly. Skipped automatically if
/// MANTLE_RPC_URL is not set.
contract DeployV2ForkTest is Test {
    bool forkActive;

    function setUp() public {
        string memory rpc;
        try vm.envString("MANTLE_RPC_URL") returns (string memory r) {
            rpc = r;
        } catch {
            return;
        }
        if (bytes(rpc).length == 0) {
            return;
        }
        vm.createSelectFork(rpc);
        forkActive = true;
    }

    function test_deployV2_readsBack() public {
        if (!forkActive) {
            vm.skip(true);
            return;
        }

        address owner = address(0xC01DC0FFEE);
        address agent = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
        address attestation = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
        address adapter = 0x24090d62792930Aa34351B8b19850581D48628f9;

        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: MantleAddresses.USDC,
            bridgeVenue: address(0),
            maxBridgeLTVBps: 0,
            allowedActions: uint32(1) << uint8(ActionType.SWAP_TO_SAFE)
        });

        vm.startPrank(owner);
        SolventVaultV2 v = new SolventVaultV2(
            MantleAddresses.USDT0,
            owner,
            agent,
            106,
            attestation,
            policy
        );
        v.setDexRouter(adapter);
        vm.stopPrank();

        assertEq(v.asset(), MantleAddresses.USDT0);
        assertEq(v.agent(), agent);
        assertEq(v.agentId(), 106);
        assertEq(v.totalAssets(), 0);
        assertEq(address(v.dexRouter()), adapter);
        // Read back policy — order from Policy.sol:
        // earlyDivergenceBps (uint16), terminalDivergenceBps (uint16), liquidityFloor (uint256),
        // maxSlippageBps (uint16), safeAsset (address), bridgeVenue (address),
        // maxBridgeLTVBps (uint16), allowedActions (uint32)
        (, , , uint16 cap, address safeAsset, , , uint32 allowed) = v.policy();
        assertEq(cap, 300);
        assertEq(safeAsset, MantleAddresses.USDC);
        assertEq(allowed, uint32(1) << uint8(ActionType.SWAP_TO_SAFE));
    }
}
