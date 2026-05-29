// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventDeployLib} from "../script/Deploy.s.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {AgniDexAdapter} from "../src/adapters/AgniDexAdapter.sol";
import {InitLendingAdapter} from "../src/adapters/InitLendingAdapter.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAgniSwapRouter} from "./mocks/MockAgniSwapRouter.sol";
import {MockAgniQuoterV2} from "./mocks/MockAgniQuoterV2.sol";
import {MockInitCore} from "./mocks/MockInitCore.sol";

contract DeployTest is Test {
    function test_deployWiresAllAdapters() public {
        MockIdentityRegistry identity = new MockIdentityRegistry();
        MockERC20 risk = new MockERC20("USDT0", "USDT0", 6);
        MockERC20 safe = new MockERC20("USDC", "USDC", 6);
        MockAgniSwapRouter agniRouter = new MockAgniSwapRouter();
        MockAgniQuoterV2 agniQuoter = new MockAgniQuoterV2();
        MockInitCore initCore = new MockInitCore();

        Policy memory p;
        p.earlyDivergenceBps = 50;
        p.terminalDivergenceBps = 500;
        p.maxSlippageBps = 300;
        p.safeAsset = address(safe);
        p.maxBridgeLTVBps = 5000;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING)) |
            (uint32(1) << uint8(ActionType.UNWIND_BRIDGE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));

        SolventDeployLib.DeployParams memory params = SolventDeployLib.DeployParams({
            identityRegistry: address(identity),
            reputationRegistry: address(0),
            riskAsset: address(risk),
            safeAsset: address(safe),
            agniRouter: address(agniRouter),
            agniQuoter: address(agniQuoter),
            agniFeeTier: 500,
            initCore: address(initCore),
            initRiskPool: address(risk),
            initSafePool: address(safe),
            owner: address(this),
            agent: address(this),
            agentURI: "ipfs://test",
            policy: p
        });

        (SolventVault vault, SolventAttestation att, AgniDexAdapter dex, InitLendingAdapter lend, uint256 agentId) =
            SolventDeployLib.deploy(params);

        assertEq(address(vault.asset()), address(risk));
        assertEq(address(vault.attestation()), address(att));
        assertEq(vault.agentId(), agentId);
        assertEq(address(dex.swapRouter()), address(agniRouter));
        assertEq(address(lend.core()), address(initCore));

        // bridgeVenue in the deployed vault's policy should be the lending adapter.
        // Policy is `Policy public policy` so the getter returns each field as a return value.
        // The position of bridgeVenue in the Policy struct is the 6th field (0-indexed: 5).
        (, , , , , address bv, , ) = vault.policy();
        assertEq(bv, address(lend));
    }
}
