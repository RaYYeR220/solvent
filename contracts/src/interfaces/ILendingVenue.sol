// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Lending-venue abstraction. Real adapters (Aave V3 IPool, INIT
/// Capital) implement this in a later plan; the vault only ever sees this.
interface ILendingVenue {
    function supply(address asset, uint256 amount, address onBehalfOf) external;
    function borrow(address asset, uint256 amount, address onBehalfOf) external;
    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
