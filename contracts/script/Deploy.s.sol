// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {AgniDexAdapter} from "../src/adapters/AgniDexAdapter.sol";
import {InitLendingAdapter} from "../src/adapters/InitLendingAdapter.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";

/// @dev Pure deployment logic, unit-testable without broadcasting.
library SolventDeployLib {
    struct DeployParams {
        address identityRegistry;
        address reputationRegistry;
        address riskAsset;
        address safeAsset;
        address agniRouter;
        address agniQuoter;
        uint24 agniFeeTier;
        address initCore;
        address initRiskPool;
        address initSafePool;
        address owner;
        address agent;
        string agentURI;
        Policy policy;
    }

    function deploy(DeployParams memory p)
        internal
        returns (
            SolventVault vault,
            SolventAttestation attestation,
            AgniDexAdapter dexAdapter,
            InitLendingAdapter lendingAdapter,
            uint256 agentId
        )
    {
        agentId = IIdentityRegistry(p.identityRegistry).register(p.agentURI);
        attestation = new SolventAttestation(p.reputationRegistry);
        dexAdapter = new AgniDexAdapter(p.agniRouter, p.agniQuoter, p.agniFeeTier);
        lendingAdapter = new InitLendingAdapter(p.initCore, p.initRiskPool, p.initSafePool);
        // Policy must reference the lending adapter as bridgeVenue.
        p.policy.bridgeVenue = address(lendingAdapter);
        vault = new SolventVault(p.riskAsset, p.owner, p.agent, agentId, address(attestation), p.policy);
    }
}

/// @notice `forge script` entrypoint. Reads config from env + MantleAddresses.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address riskAsset;
        try vm.envAddress("RISK_ASSET") returns (address a) { riskAsset = a; } catch { riskAsset = MantleAddresses.USDT0; }

        address safeAsset;
        try vm.envAddress("SAFE_ASSET") returns (address a) { safeAsset = a; } catch { safeAsset = MantleAddresses.USDC; }

        address initRiskPool = _pickInitPool(riskAsset);
        address initSafePool = _pickInitPool(safeAsset);
        require(initRiskPool != address(0), "Deploy: no INIT pool for RISK_ASSET");
        require(initSafePool != address(0), "Deploy: no INIT pool for SAFE_ASSET");

        Policy memory p;
        p.earlyDivergenceBps = 50;
        p.terminalDivergenceBps = 500;
        p.liquidityFloor = 0;
        p.maxSlippageBps = 300;
        p.safeAsset = safeAsset;
        p.bridgeVenue = address(0);    // set by SolventDeployLib after adapter deploy
        p.maxBridgeLTVBps = 5000;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        SolventDeployLib.DeployParams memory params = SolventDeployLib.DeployParams({
            identityRegistry: MantleAddresses.ERC8004_IDENTITY_REGISTRY,
            reputationRegistry: MantleAddresses.ERC8004_REPUTATION_REGISTRY,
            riskAsset: riskAsset,
            safeAsset: safeAsset,
            agniRouter: MantleAddresses.AGNI_SWAP_ROUTER,
            agniQuoter: MantleAddresses.AGNI_QUOTER_V2,
            agniFeeTier: 500,
            initCore: MantleAddresses.INIT_CORE,
            initRiskPool: initRiskPool,
            initSafePool: initSafePool,
            owner: deployer,
            agent: deployer,
            agentURI: "ipfs://solvent-agent",
            policy: p
        });

        vm.startBroadcast(pk);
        (SolventVault vault, SolventAttestation att, AgniDexAdapter dex, InitLendingAdapter lend, uint256 agentId) =
            SolventDeployLib.deploy(params);
        vault.setDexRouter(address(dex));
        vault.setYieldVenue(address(lend));
        vm.stopBroadcast();

        console2.log("SolventVault:        ", address(vault));
        console2.log("SolventAttestation:  ", address(att));
        console2.log("AgniDexAdapter:      ", address(dex));
        console2.log("InitLendingAdapter:  ", address(lend));
        console2.log("agentId:             ", agentId);
        console2.log("riskAsset:           ", riskAsset);
        console2.log("safeAsset:           ", safeAsset);
    }

    function _pickInitPool(address asset) internal pure returns (address) {
        if (asset == MantleAddresses.USDY) return MantleAddresses.INIT_USDY_POOL;
        if (asset == MantleAddresses.USDT0) return MantleAddresses.INIT_USDT_POOL;
        if (asset == MantleAddresses.USDC) return MantleAddresses.INIT_USDC_POOL;
        return address(0);
    }
}
