// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgniDexAdapter} from "../../src/adapters/AgniDexAdapter.sol";
import {MantleAddresses} from "../../script/MantleAddresses.sol";

/// @notice Integration test against real Agni on a Mantle mainnet fork.
/// Skipped automatically if MANTLE_RPC_URL is not set.
/// Uses the USDT/USDY pool (fee=100, ~2.4e14 liquidity as of 2026-05-29).
/// USDT0/USDC pool exists but has near-zero liquidity and the quoter reverts.
contract AgniDexAdapterForkTest is Test {
    AgniDexAdapter adapter;

    function setUp() public {
        try vm.envString("MANTLE_RPC_URL") returns (string memory rpc) {
            if (bytes(rpc).length == 0) vm.skip(true);
        } catch {
            vm.skip(true);
        }
        vm.createSelectFork(vm.rpcUrl("mantle"));
        adapter = new AgniDexAdapter(
            MantleAddresses.AGNI_SWAP_ROUTER,
            MantleAddresses.AGNI_QUOTER_V2,
            100 // 0.01% — fee tier of the liquid USDT/USDY pool
        );
    }

    /// @notice 1 USDT (6 dec) -> USDY (18 dec) via the liquid Agni pool.
    /// Roughly 1 USDT ~ 0.9x USDY (USDY trades at slight premium to USD).
    function test_quoteUsdtForUsdy() public {
        uint256 out = adapter.quote(MantleAddresses.USDT, MantleAddresses.USDY, 1e6);
        assertGt(out, 0.8e18, "Agni quoter returned implausibly low amount");
        assertLt(out, 1.2e18, "Quote returned implausibly high amount");
    }
}
