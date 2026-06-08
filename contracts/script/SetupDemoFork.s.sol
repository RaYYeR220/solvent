// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SolventVaultV2_1} from "../src/SolventVaultV2_1.sol";
import {AgniDexAdapter} from "../src/adapters/AgniDexAdapter.sol";
import {InitLendingAdapterV2} from "../src/adapters/InitLendingAdapterV2.sol";
import {Policy, ActionType} from "../src/Policy.sol";
import {MantleAddresses} from "./MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice One-shot fork bootstrap. Run against anvil --fork-url <mantle>.
/// Deploys a USDY `SolventVaultV2_1` (INIT-aware totalAssets) + an Agni fee=100
/// swap adapter + an `InitLendingAdapterV2` (USDY collateral / USDC borrow), wires
/// a bridge-enabled policy (swap|bridge|unwind), funds a depositor, deposits.
///
/// DEMO_DEPOSIT (USDY, 18dec) controls swap-vs-bridge at depeg time — it is the
/// vault's risk balance the agent must protect:
///   - SMALL  (<= ~$1k pool depth, e.g. 100e18) => the pool can absorb a full
///     exit, so the agent SWAPS to safe (SWAP_TO_SAFE).
///   - LARGE  (> pool depth, e.g. 5000e18) => a swap can't clear cleanly, so on
///     an EARLY (transient) depeg the agent BRIDGES via INIT lending
///     (BRIDGE_VIA_LENDING) and UNWINDS on the re-peg.
///
/// FUNDING NOTE: `deal()` is a forge-std *Test* cheatcode (unavailable in a
/// Script) and would not persist on a `--broadcast` against a running anvil
/// anyway. So the depositor must be PRE-FUNDED with USDY out-of-band first
/// (the runbook does this via `anvil_setStorageAt` on the USDY balance slot)
/// and then this script's approve+deposit broadcast as real, persistent txs.
/// See docs/demo-live-depeg.md. If the depositor is underfunded, the deposit is
/// skipped so deployment still succeeds and the runbook's manual step can follow.
contract SetupDemoFork is Script {
    address constant ATTESTATION = 0x89D3F83B777b245A80baec60277B449B8E72B5D3;
    address constant AGENT_EOA   = 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c;
    uint256 constant AGENT_ID    = 106;

    function run() external {
        address owner    = vm.envAddress("DEPLOYER_ADDRESS");      // anvil acct 0
        address depositor= vm.envOr("DEMO_DEPOSITOR", owner);
        uint256 depUSDY  = vm.envOr("DEMO_DEPOSIT", uint256(100 ether)); // 100 USDY (<= pool depth => swap)

        vm.startBroadcast();
        // Swap venue (Agni fee=100 USDY/USDC).
        AgniDexAdapter adapter = new AgniDexAdapter(
            MantleAddresses.AGNI_SWAP_ROUTER, MantleAddresses.AGNI_QUOTER_V2, 100
        );
        // Bridge venue (INIT: USDY collateral -> USDC borrow). Order:
        // (core, posManager, riskPool=inUSDY, safePool=inUSDC, riskUnderlying=USDY, safeUnderlying=USDC).
        InitLendingAdapterV2 bridge = new InitLendingAdapterV2(
            MantleAddresses.INIT_CORE,
            MantleAddresses.INIT_POS_MANAGER,
            MantleAddresses.INIT_USDY_POOL,
            MantleAddresses.INIT_USDC_POOL,
            MantleAddresses.USDY,
            MantleAddresses.USDC
        );

        // Bridge-enabled policy: swap|bridge|unwind. maxBridgeLTVBps=5000 (50%),
        // safely below INIT's observed ~65% usable LTV on USDY collateral.
        Policy memory policy = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: MantleAddresses.USDC,
            bridgeVenue: address(bridge),
            maxBridgeLTVBps: 5000,
            allowedActions: (uint32(1) << uint8(ActionType.SWAP_TO_SAFE))
                | (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING))
                | (uint32(1) << uint8(ActionType.UNWIND_BRIDGE))
        });

        SolventVaultV2_1 v = new SolventVaultV2_1(
            MantleAddresses.USDY, owner, AGENT_EOA, AGENT_ID, ATTESTATION, policy
        );
        v.setDexRouter(address(adapter));
        vm.stopBroadcast();

        // Deposit USDY into the vault (only if the depositor is pre-funded; see
        // FUNDING NOTE above). Skipped gracefully otherwise so deploy succeeds.
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
        console.log("BRIDGE", address(bridge));
    }
}
