// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";

/// @notice Deploys SolventVaultV2 with the V2 default policy, wires existing
/// adapters, sets the agent EOA, and prints the address. Reuses the already
/// deployed SolventAttestation (V1's instance — it's vault-agnostic).
contract DeployV2 is Script {
    // Deployed in Plan 5; vault-agnostic so V2 can reuse it.
    address constant ATTESTATION = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
    address constant AGNI_DEX_ADAPTER = 0x24090d62792930Aa34351B8b19850581D48628f9;
    address constant AGENT_EOA = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
    uint256 constant AGENT_ID = 106;

    function run() external returns (address vault) {
        address owner = vm.envAddress("DEPLOYER_ADDRESS");
        address riskAsset = vm.envOr("RISK_ASSET", MantleAddresses.USDT0);
        address safeAsset = vm.envOr("SAFE_ASSET", MantleAddresses.USDC);

        // ActionType: NONE=0, SWAP_TO_SAFE=1, BRIDGE_VIA_LENDING=2, UNWIND_BRIDGE=3, PARK_YIELD=4
        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: safeAsset,
            bridgeVenue: address(0),       // BRIDGE disabled in V2
            maxBridgeLTVBps: 0,
            allowedActions: uint32(1) << uint8(ActionType.SWAP_TO_SAFE)
        });

        vm.startBroadcast();

        SolventVaultV2 v = new SolventVaultV2(
            riskAsset,
            owner,
            AGENT_EOA,
            AGENT_ID,
            ATTESTATION,
            policy
        );
        v.setDexRouter(AGNI_DEX_ADAPTER);
        // yieldVenue intentionally left unset: PARK_YIELD is disabled in V2 policy.

        vm.stopBroadcast();

        vault = address(v);
        console.log("SolventVaultV2 deployed at:", vault);
        console.log("  owner:", owner);
        console.log("  agent:", AGENT_EOA);
        console.log("  asset (USDT0):", riskAsset);
        console.log("  safeAsset (USDC):", safeAsset);
        console.log("  attestation:", ATTESTATION);
        console.log("  dexRouter:", AGNI_DEX_ADAPTER);
    }
}
