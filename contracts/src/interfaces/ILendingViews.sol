// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Position-read views a bridge venue exposes so the vault's
/// `totalAssets()` can value an open INIT lending position. Implemented by
/// `InitLendingAdapterV2`; both views return 0 when there is no open position.
///   - `collateralUnderlying()` : collateral in the COLLATERAL underlying's own
///     units (e.g. USDY, 18 dec) — i.e. the vault's `asset()` units.
///   - `debtUnderlying()`       : debt in the BORROW underlying's units (e.g.
///     USDC, 6 dec) — i.e. the vault's `safeAsset` units.
interface ILendingViews {
    function collateralUnderlying() external view returns (uint256);
    function debtUnderlying() external view returns (uint256);
}
