// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgniExactInputSingleParams} from "../../src/adapters/AgniDexAdapter.sol";

/// @notice Minimal Agni-V3-shaped router for unit tests.
contract MockAgniSwapRouter {
    uint256 public payoutNumerator = 1e18;
    uint256 public payoutDenominator = 1e18;

    function setRate(uint256 numerator, uint256 denominator) external {
        payoutNumerator = numerator;
        payoutDenominator = denominator;
    }

    function exactInputSingle(AgniExactInputSingleParams calldata p) external returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = (p.amountIn * payoutNumerator) / payoutDenominator;
        require(amountOut >= p.amountOutMinimum, "MockAgniSwapRouter: under min");
        IERC20(p.tokenOut).transfer(p.recipient, amountOut);
    }
}
