// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingVenue} from "../interfaces/ILendingVenue.sol";

interface IInitCore {
    function createPos(uint16 mode, address viewer) external returns (uint256 posId);
    function collateralize(uint256 posId, address pool, uint256 amount) external;
    function decollateralize(uint256 posId, address pool, uint256 amount, address recipient) external;
    function borrow(uint256 posId, address pool, uint256 amount) external;
    function repay(uint256 posId, address pool, uint256 amount) external;
}

/// @notice INIT Capital adapter behind the ILendingVenue facade.
///
/// MVP scope: ONE risk pool + ONE safe pool, both fixed at construction.
/// Manages a single INIT position, lazy-created on first supply.
///
/// "Pool" address in INIT's model addresses a per-asset deposit pool (e.g.
/// INIT_USDY_POOL). Callers passing this adapter's `supply`/`borrow` use the
/// pool address as `asset`, NOT the underlying token. This matches INIT's API.
contract InitLendingAdapter is ILendingVenue {
    using SafeERC20 for IERC20;

    error UnsupportedAsset();
    error ZeroAddress();
    error NoPosition();

    IInitCore public immutable core;
    address public immutable riskPool;
    address public immutable safePool;

    uint256 public posId;

    constructor(address core_, address riskPool_, address safePool_) {
        if (core_ == address(0) || riskPool_ == address(0) || safePool_ == address(0)) revert ZeroAddress();
        core = IInitCore(core_);
        riskPool = riskPool_;
        safePool = safePool_;
    }

    function _ensurePosition() internal {
        if (posId == 0) {
            posId = core.createPos(1, address(this));
        }
    }

    function supply(address asset, uint256 amount, address /* onBehalfOf */) external {
        if (asset != riskPool) revert UnsupportedAsset();
        _ensurePosition();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).forceApprove(address(core), amount);
        core.collateralize(posId, riskPool, amount);
        IERC20(asset).forceApprove(address(core), 0);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        if (asset != safePool) revert UnsupportedAsset();
        if (posId == 0) revert NoPosition();
        uint256 balBefore = IERC20(asset).balanceOf(address(this));
        core.borrow(posId, safePool, amount);
        uint256 received = IERC20(asset).balanceOf(address(this)) - balBefore;
        IERC20(asset).safeTransfer(onBehalfOf, received);
    }

    function repay(address asset, uint256 amount, address /* onBehalfOf */) external returns (uint256) {
        if (asset != safePool) revert UnsupportedAsset();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).forceApprove(address(core), amount);
        core.repay(posId, safePool, amount);
        IERC20(asset).forceApprove(address(core), 0);
        return amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        if (asset != riskPool) revert UnsupportedAsset();
        uint256 balBefore = IERC20(asset).balanceOf(to);
        core.decollateralize(posId, riskPool, amount, to);
        return IERC20(asset).balanceOf(to) - balBefore;
    }
}
