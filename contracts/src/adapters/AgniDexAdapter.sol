// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDexRouter} from "../interfaces/IDexRouter.sol";

struct AgniExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

interface IAgniSwapRouter {
    function exactInputSingle(AgniExactInputSingleParams calldata params) external returns (uint256 amountOut);
}

struct AgniQuoteExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint24 fee;
    uint160 sqrtPriceLimitX96;
}

interface IAgniQuoterV2 {
    // Note: not view — V3 quoters simulate swaps via revert (state mutation required).
    function quoteExactInputSingle(AgniQuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

/// @notice Translates the vault's V2-style swap call to an Agni V3 single-hop
/// exactInputSingle. Multi-hop paths revert — the vault never needs them.
/// The fee tier is set at construction. Deploy one adapter per pool fee tier.
contract AgniDexAdapter is IDexRouter {
    using SafeERC20 for IERC20;

    error MultiHopUnsupported();
    error ZeroAddress();

    address public immutable swapRouter;
    address public immutable quoter;
    uint24 public immutable feeTier;

    constructor(address swapRouter_, address quoter_, uint24 feeTier_) {
        if (swapRouter_ == address(0) || quoter_ == address(0)) revert ZeroAddress();
        swapRouter = swapRouter_;
        quoter = quoter_;
        feeTier = feeTier_;
    }

    /// @notice IDexRouter implementation.
    /// @dev The vault enforces its own slippage floor before calling this; we
    ///      additionally pass amountOutMin to Agni's exactInputSingle.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        if (path.length != 2) revert MultiHopUnsupported();

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).forceApprove(swapRouter, amountIn);

        uint256 amountOut = IAgniSwapRouter(swapRouter).exactInputSingle(
            AgniExactInputSingleParams({
                tokenIn: path[0],
                tokenOut: path[1],
                fee: feeTier,
                recipient: to,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(path[0]).forceApprove(swapRouter, 0);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }

    /// @notice Off-chain quote helper (not on the IDexRouter interface).
    /// @dev Not view because V3 quoters simulate swaps via state mutation + revert.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 amountOut) {
        (amountOut,,,) = IAgniQuoterV2(quoter).quoteExactInputSingle(
            AgniQuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: feeTier,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
