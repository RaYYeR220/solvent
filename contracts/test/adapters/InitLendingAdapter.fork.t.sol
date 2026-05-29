// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {InitLendingAdapter} from "../../src/adapters/InitLendingAdapter.sol";
import {MantleAddresses} from "../../script/MantleAddresses.sol";

/// @notice Integration smoke test against real INIT Capital on a Mantle fork.
/// Only verifies the adapter deploys and INIT_CORE has code. Full lifecycle
/// is exercised in Plan 6 via the live agent. Skipped if MANTLE_RPC_URL unset.
contract InitLendingAdapterForkTest is Test {
    InitLendingAdapter adapter;

    function setUp() public {
        try vm.envString("MANTLE_RPC_URL") returns (string memory rpc) {
            if (bytes(rpc).length == 0) vm.skip(true);
        } catch {
            vm.skip(true);
        }
        vm.createSelectFork(vm.rpcUrl("mantle"));
        adapter = new InitLendingAdapter(
            MantleAddresses.INIT_CORE,
            MantleAddresses.INIT_USDT_POOL,
            MantleAddresses.INIT_USDC_POOL
        );
    }

    function test_constructorWiresAddresses() public {
        assertEq(address(adapter.core()), MantleAddresses.INIT_CORE);
        assertEq(adapter.riskPool(), MantleAddresses.INIT_USDT_POOL);
        assertEq(adapter.safePool(), MantleAddresses.INIT_USDC_POOL);
    }

    function test_initCoreCodeExists() public {
        uint256 codeSize;
        address coreAddr = MantleAddresses.INIT_CORE;
        assembly { codeSize := extcodesize(coreAddr) }
        assertGt(codeSize, 0, "INIT_CORE has no code on this fork");
    }
}
