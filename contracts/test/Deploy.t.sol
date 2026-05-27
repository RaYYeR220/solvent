// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventDeployLib} from "../script/Deploy.s.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract DeployTest is Test {
    function test_deployRegistersIdentityAndWiresVault() public {
        MockERC20 usdy = new MockERC20("USDY", "USDY", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockIdentityRegistry registry = new MockIdentityRegistry();

        Policy memory p;
        p.maxSlippageBps = 300;
        p.safeAsset = address(usdc);
        p.maxBridgeLTVBps = 5000;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        (SolventVault vault, SolventAttestation att, uint256 agentId) =
            SolventDeployLib.deploy(
                address(registry),
                "ipfs://solvent-agent",
                address(usdy),
                address(this), // owner
                address(this), // agent
                p
            );

        assertEq(agentId, 1);
        assertEq(vault.agentId(), 1);
        assertEq(registry.ownerOf(agentId), address(this));
        assertEq(address(vault.attestation()), address(att));
        assertEq(address(vault.asset()), address(usdy));
    }
}
