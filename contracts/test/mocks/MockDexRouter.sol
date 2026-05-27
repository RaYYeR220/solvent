// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IDexRouter} from "../../src/interfaces/IDexRouter.sol";

/// @dev Swaps path[0] -> path[last] at `rateBps` (10000 = 1:1 in value),
/// decimal-adjusted. Must be pre-funded with the output token.
contract MockDexRouter is IDexRouter {
    uint256 public rateBps = 10000;

    function setRateBps(uint256 r) external {
        rateBps = r;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        uint8 di = IERC20Metadata(tokenIn).decimals();
        uint8 dout = IERC20Metadata(tokenOut).decimals();
        uint256 out = (amountIn * rateBps * (10 ** dout)) / (10000 * (10 ** di));
        require(out >= amountOutMin, "MockDexRouter: insufficient output");

        IERC20(tokenOut).transfer(to, out);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}
