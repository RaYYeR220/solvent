// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {Policy, ActionType} from "../src/Policy.sol";

/// @dev Pure deployment logic, unit-testable without broadcasting.
library SolventDeployLib {
    function deploy(
        address identityRegistry,
        string memory agentURI,
        address asset,
        address owner,
        address agent,
        Policy memory policy
    ) internal returns (SolventVault vault, SolventAttestation attestation, uint256 agentId) {
        agentId = IIdentityRegistry(identityRegistry).register(agentURI);
        attestation = new SolventAttestation();
        vault = new SolventVault(asset, owner, agent, agentId, address(attestation), policy);
    }
}

/// @notice `forge script` entrypoint. Reads config from env (see .env.example).
/// NOTE: confirm Mantle addresses on MantleScan before broadcasting (Task 9 open items).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY_ADDRESS");
        address asset = vm.envAddress("ASSET_ADDRESS");
        address safeAsset = vm.envAddress("SAFE_ASSET_ADDRESS");
        address dexRouter = vm.envAddress("DEX_ROUTER_ADDRESS");
        address bridgeVenue = vm.envAddress("BRIDGE_VENUE_ADDRESS");
        address yieldVenue = vm.envAddress("YIELD_VENUE_ADDRESS");
        address deployer = vm.addr(pk);

        Policy memory p;
        p.earlyDivergenceBps = 50;       // 0.5%
        p.terminalDivergenceBps = 500;   // 5%
        p.liquidityFloor = 0;            // tuned later by the agent config
        p.maxSlippageBps = 300;          // 3%
        p.safeAsset = safeAsset;
        p.bridgeVenue = bridgeVenue;
        p.maxBridgeLTVBps = 5000;        // 50%
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        vm.startBroadcast(pk);
        (SolventVault vault,, uint256 agentId) =
            SolventDeployLib.deploy(identityRegistry, "ipfs://solvent-agent", asset, deployer, deployer, p);
        vault.setDexRouter(dexRouter);
        vault.setYieldVenue(yieldVenue);
        vm.stopBroadcast();

        // forge prints these; capture for the dashboard + submission.
        // vault, vault.attestation(), agentId
        agentId; // silence unused in some compiler settings
    }
}
