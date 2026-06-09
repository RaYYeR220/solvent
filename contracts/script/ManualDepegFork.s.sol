// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MantleAddresses} from "./MantleAddresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAgniRouter {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256);
}

/// @notice Push the USDY/USDC f100 price down (depeg) or back up (repeg) on a fork.
/// MODE: terminal | transient | repeg. AMOUNT overrides the default size.
///
/// FUNDING NOTE: `deal()` is a forge-std *Test* cheatcode (not available in a
/// Script) and would not persist on a broadcast against a running anvil anyway.
/// So the swapper (DEPLOYER_ADDRESS) must be PRE-FUNDED with the input token
/// out-of-band before running this script (the runbook does this via whale
/// impersonation). This script only approves + executes the swap as real txs.
contract ManualDepegFork is Script {
    function run() external {
        string memory mode = vm.envOr("MODE", string("terminal"));
        address swapper = vm.envAddress("DEPLOYER_ADDRESS");
        IAgniRouter router = IAgniRouter(MantleAddresses.AGNI_SWAP_ROUTER);

        bool repeg = keccak256(bytes(mode)) == keccak256("repeg");
        address tokenIn  = repeg ? MantleAddresses.USDC : MantleAddresses.USDY;
        address tokenOut = repeg ? MantleAddresses.USDY : MantleAddresses.USDC;

        // Defaults sized against the ~$1k pool: transient = mild, terminal = hard.
        uint256 def = repeg ? 2000e6
            : keccak256(bytes(mode)) == keccak256("transient") ? 300 ether : 5000 ether;
        uint256 amountIn = vm.envOr("AMOUNT", def);

        require(
            IERC20(tokenIn).balanceOf(swapper) >= amountIn,
            "swapper underfunded: pre-fund tokenIn (see runbook whale impersonation)"
        );

        vm.startBroadcast(swapper);
        IERC20(tokenIn).approve(address(router), amountIn);
        uint256 out = router.exactInputSingle(IAgniRouter.ExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, fee: 100, recipient: swapper,
            deadline: block.timestamp + 600, amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }));
        vm.stopBroadcast();
        console.log("mode", mode);
        console.log("amountIn", amountIn);
        console.log("amountOut", out);
    }
}
