// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SolventVaultV2} from "../src/SolventVaultV2.sol";
import {AgniDexAdapter} from "../src/adapters/AgniDexAdapter.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice One-shot fork bootstrap. Run against anvil --fork-url <mantle>.
/// Deploys a USDY vault + fee=100 Agni adapter, funds a depositor, deposits.
/// DEMO_DEPOSIT (USDY, 18dec) controls swap-vs-bridge: small => swap.
///
/// FUNDING NOTE: `deal()` below is a forge-std cheatcode. In `forge script
/// --broadcast` it only mutates the in-memory simulation, NOT the running
/// anvil node, so the depositor's USDY balance does not persist and the
/// `deposit()` broadcast would revert against the live fork. For the
/// persistent demo we fund USDY out-of-band first (anvil_setStorageAt on the
/// ERC20 balance slot, or whale impersonation) and then deposit via `cast send`.
/// See docs/demo-live-depeg.md. The `--sender` (deployer) only needs to deploy
/// + wire the vault here; the deposit half is harmless if pre-funded and
/// otherwise documented as the runbook's separate step.
contract SetupDemoFork is Script {
    address constant ATTESTATION = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
    address constant AGENT_EOA   = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
    uint256 constant AGENT_ID    = 106;

    function run() external {
        address owner    = vm.envAddress("DEPLOYER_ADDRESS");      // anvil acct 0
        address depositor= vm.envOr("DEMO_DEPOSITOR", owner);
        uint256 depUSDY  = vm.envOr("DEMO_DEPOSIT", uint256(100 ether)); // 100 USDY (<= pool depth => swap)

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

        vm.startBroadcast();
        AgniDexAdapter adapter = new AgniDexAdapter(
            MantleAddresses.AGNI_SWAP_ROUTER, MantleAddresses.AGNI_QUOTER_V2, 100
        );
        SolventVaultV2 v = new SolventVaultV2(
            MantleAddresses.USDY, owner, AGENT_EOA, AGENT_ID, ATTESTATION, policy
        );
        v.setDexRouter(address(adapter));
        vm.stopBroadcast();

        // Deposit USDY into the vault.
        // NOTE: `deal()` is a forge-std *Test* cheatcode and is not available in
        // Script; even if it were, it would not persist on a broadcast against a
        // running anvil node. So the depositor must be PRE-FUNDED with USDY
        // out-of-band before this script runs (the runbook does this via
        // anvil_setStorageAt on the USDY balance slot). When pre-funded, the
        // approve+deposit below broadcast as real txs and persist. If the
        // depositor is not funded, we skip the deposit so deployment still
        // succeeds and the runbook's manual deposit step can follow.
        uint256 bal = IERC20(MantleAddresses.USDY).balanceOf(depositor);
        if (bal >= depUSDY && depUSDY > 0) {
            vm.startBroadcast(depositor);
            IERC20(MantleAddresses.USDY).approve(address(v), depUSDY);
            v.deposit(depUSDY, depositor);
            vm.stopBroadcast();
            console.log("DEPOSITED", depUSDY);
        } else {
            console.log("SKIP_DEPOSIT_DEPOSITOR_UNDERFUNDED bal", bal);
        }

        console.log("VAULT", address(v));
        console.log("ADAPTER", address(adapter));
    }
}
