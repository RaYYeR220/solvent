// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDexRouter} from "../../src/interfaces/IDexRouter.sol";

/// @notice V2-test-suite mock DEX. Uses a num/den rate so callers can express
/// arbitrary payouts (1:1, lossy, gainy) without thinking in bps. Pre-fund the
/// router with the output token before invoking a swap.
/// @dev Distinct contract name from V1's MockDexRouter (which uses setRateBps)
/// to avoid collisions in shared test compilation.
contract MockDexRouterV2 is IDexRouter {
    uint256 public payoutNumerator = 1e6;
    uint256 public payoutDenominator = 1e6;

    function setRate(uint256 num, uint256 den) external {
        payoutNumerator = num;
        payoutDenominator = den;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * payoutNumerator) / payoutDenominator;
        require(out >= amountOutMin, "MockDexRouterV2: under min");
        IERC20(path[path.length - 1]).transfer(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}
