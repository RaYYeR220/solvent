// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILendingVenue} from "../../src/interfaces/ILendingVenue.sol";

/// @dev Minimal bookkeeping venue. Must be pre-funded with borrowable tokens.
contract MockLendingVenue is ILendingVenue {
    mapping(address => mapping(address => uint256)) public supplied; // user => asset => amount
    mapping(address => mapping(address => uint256)) public borrowed; // user => asset => amount

    function supply(address asset, uint256 amount, address onBehalfOf) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    /// @dev Aave-style: borrowed tokens go to msg.sender; onBehalfOf accrues the debt.
    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        borrowed[onBehalfOf][asset] += amount;
        IERC20(asset).transfer(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        borrowed[onBehalfOf][asset] -= amount;
        return amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        supplied[msg.sender][asset] -= amount;
        IERC20(asset).transfer(to, amount);
        return amount;
    }
}
