// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AgniQuoteExactInputSingleParams} from "../../src/adapters/AgniDexAdapter.sol";

contract MockAgniQuoterV2 {
    uint256 public quotedAmountOut = 1e18;

    function setQuotedAmountOut(uint256 v) external {
        quotedAmountOut = v;
    }

    function quoteExactInputSingle(AgniQuoteExactInputSingleParams memory)
        external
        returns (uint256 amountOut, uint160, uint32, uint256)
    {
        return (quotedAmountOut, 0, 0, 0);
    }
}
