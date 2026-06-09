// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingVenue} from "../interfaces/ILendingVenue.sol";

/*//////////////////////////////////////////////////////////////////////////
   INIT Capital — CONFIRMED ABI (pinned GREEN on a Mantle fork by
   contracts/test/InitFork.t.sol; selectors cross-checked against the live
   impl bytecode). This is the SOURCE OF TRUTH; the old src/adapters/
   InitLendingAdapter.sol used WRONG signatures — do not reuse it.

   Lifecycle (USDY collateral, USDC borrow):
     mintTo(pool,to)->shares          : transfer underlying INTO pool first.
     burnTo(pool,to)->amount          : transfer inTokens INTO pool first.
     createPos(mode,viewer)->posId     : mints an ERC721 NFT to `viewer`.
     collateralize(posId,pool)         : NO amount arg; sweeps inTokens sent
                                         to POS_MANAGER before the call.
     decollateralize(posId,pool,shares,to) -> sends inTokens to `to`.
     borrow(pool,amount,posId,to)->debtShares : `amount` is UNDERLYING and is
                                         sent straight to `to`.
     repay(pool,repayShares,posId)->repaidAmount : repay BY DEBT-SHARES; Core
                                         pulls pool.debtShareToAmtCurrent(shares)
                                         underlying (approve Core first).
   Reads (off POS_MANAGER, NOT Core):
     getPosCollInfo(posId)->(pools,amts,...) : amts = inToken SHARES held as
                                         collateral; underlying = pool.toAmt(shares).
     getPosBorrInfo(posId)->(pools,debtShares): underlying debt =
                                         pool.debtShareToAmtStored(debtShares).
//////////////////////////////////////////////////////////////////////////*/

interface IInitCore {
    function createPos(uint16 mode, address viewer) external returns (uint256 posId);
    function mintTo(address pool, address receiver) external returns (uint256 shares);
    function burnTo(address pool, address receiver) external returns (uint256 amount);
    function collateralize(uint256 posId, address pool) external;
    function decollateralize(uint256 posId, address pool, uint256 shares, address receiver) external;
    function borrow(address pool, uint256 amount, uint256 posId, address receiver)
        external
        returns (uint256 debtShares);
    function repay(address pool, uint256 repayShares, uint256 posId) external returns (uint256 repaidAmount);
}

interface IInitPosManager {
    function getPosCollInfo(uint256 posId)
        external
        view
        returns (
            address[] memory pools,
            uint256[] memory amts,
            address[] memory wLps,
            uint256[][] memory ids,
            uint256[][] memory wLpAmts
        );
    function getPosBorrInfo(uint256 posId)
        external
        view
        returns (address[] memory pools, uint256[] memory debtShares);
}

interface IInitLendingPool {
    function underlyingToken() external view returns (address);
    // view (stale, last-accrued rate) — safe to call from the vault's view totalAssets()
    function toAmt(uint256 shares) external view returns (uint256 amt);
    function debtShareToAmtStored(uint256 shares) external view returns (uint256 amt);
    // current (accrues; mutating) — used inside state-changing flows for exactness
    function toAmtCurrent(uint256 shares) external returns (uint256 amt);
    function debtShareToAmtCurrent(uint256 shares) external returns (uint256 amt);
}

/// @notice INIT Capital lending adapter behind the `ILendingVenue` facade. The
/// vault speaks in UNDERLYING tokens (it passes `asset()` = the risk/collateral
/// underlying for supply/withdraw and `safeAsset` = the borrow underlying for
/// borrow/repay); this adapter bridges underlying <-> INIT inTokens and INIT's
/// transfer-then-call / share-based debt model. Manages a single INIT position
/// (an ERC721 NFT), lazily created on the first supply.
///
/// MVP scope: ONE risk pool (collateral, e.g. inUSDY) + ONE safe pool (borrow,
/// e.g. inUSDC), both fixed at construction.
contract InitLendingAdapterV2 is ILendingVenue {
    using SafeERC20 for IERC20;

    error UnsupportedAsset();
    error ZeroAddress();
    error NoPosition();

    uint16 internal constant MODE = 1; // mode 1 whitelists inUSDY (coll) + inUSDC (borrow)

    IInitCore public immutable core;
    address public immutable posManager;

    // Collateral ("risk") side
    address public immutable riskPool; // inUSDY
    address public immutable riskUnderlying; // USDY (18 dec)

    // Borrow ("safe") side
    address public immutable safePool; // inUSDC
    address public immutable safeUnderlying; // USDC (6 dec)

    uint256 public posId;

    /// @param core_           INIT Core (proxy).
    /// @param posManager_     INIT position manager (reads + collateralize sink).
    /// @param riskPool_       inToken pool for the collateral underlying (inUSDY).
    /// @param safePool_       inToken pool for the borrow underlying (inUSDC).
    /// @param riskUnderlying_ collateral underlying token (USDY) — the vault's asset().
    /// @param safeUnderlying_ borrow underlying token (USDC) — the vault's safeAsset.
    constructor(
        address core_,
        address posManager_,
        address riskPool_,
        address safePool_,
        address riskUnderlying_,
        address safeUnderlying_
    ) {
        if (
            core_ == address(0) || posManager_ == address(0) || riskPool_ == address(0) || safePool_ == address(0)
                || riskUnderlying_ == address(0) || safeUnderlying_ == address(0)
        ) revert ZeroAddress();
        core = IInitCore(core_);
        posManager = posManager_;
        riskPool = riskPool_;
        safePool = safePool_;
        riskUnderlying = riskUnderlying_;
        safeUnderlying = safeUnderlying_;
    }

    /// @dev INIT positions are ERC721 NFTs minted to `viewer` (this adapter) by
    /// createPos, so the adapter must accept ERC721 safe-transfers.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _ensurePosition() internal {
        if (posId == 0) {
            posId = core.createPos(MODE, address(this));
        }
    }

    // -------------------------------------------------------------------------
    //                              ILendingVenue
    // -------------------------------------------------------------------------

    /// @notice Supply collateral underlying (USDY): pull from caller -> mint
    /// inUSDY shares -> collateralize into the position (lazily created).
    function supply(address asset, uint256 amount, address /* onBehalfOf */ ) external {
        if (asset != riskUnderlying) revert UnsupportedAsset();
        _ensurePosition();

        // 1) Pull underlying and transfer it INTO the pool, then mint inTokens.
        IERC20(riskUnderlying).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(riskUnderlying).safeTransfer(riskPool, amount);
        uint256 shares = core.mintTo(riskPool, address(this));

        // 2) collateralize() takes NO amount: it sweeps inTokens transferred to
        //    the position manager before the call.
        IERC20(riskPool).safeTransfer(posManager, shares);
        core.collateralize(posId, riskPool);
    }

    /// @notice Borrow `amount` of the safe underlying (USDC) against the
    /// position; INIT sends the UNDERLYING straight to a receiver, which we then
    /// forward to `onBehalfOf`.
    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        if (asset != safeUnderlying) revert UnsupportedAsset();
        if (posId == 0) revert NoPosition();

        uint256 balBefore = IERC20(safeUnderlying).balanceOf(address(this));
        core.borrow(safePool, amount, posId, address(this));
        uint256 received = IERC20(safeUnderlying).balanceOf(address(this)) - balBefore;
        IERC20(safeUnderlying).safeTransfer(onBehalfOf, received);
    }

    /// @notice Repay up to `amount` of the safe underlying (USDC). INIT repays
    /// BY DEBT-SHARES, so we convert `amount` -> shares (capped at the current
    /// debt) and let Core pull the corresponding underlying. Returns the
    /// underlying actually repaid. Any pulled-short USDC dust is returned to the
    /// caller.
    function repay(address asset, uint256 amount, address /* onBehalfOf */ ) external returns (uint256) {
        if (asset != safeUnderlying) revert UnsupportedAsset();
        if (posId == 0) revert NoPosition();

        IERC20(safeUnderlying).safeTransferFrom(msg.sender, address(this), amount);

        // Resolve the shares to repay. If `amount` covers (>=) the whole debt,
        // close it entirely by repaying ALL current debt shares; otherwise size
        // the shares PROPORTIONALLY from the position's own debt and round DOWN,
        // so Core never pulls more underlying than `amount` (which would trip the
        // allowance). Sizing off `debtAmtToShareCurrent` is avoided: its rounding
        // does not reconcile 1:1 with `debtShareToAmtCurrent`, leaving residue.
        uint256 outstandingShares = _debtShares();
        uint256 repayShares;
        if (outstandingShares == 0) {
            // Nothing to repay; hand the pulled funds back.
            IERC20(safeUnderlying).safeTransfer(msg.sender, amount);
            return 0;
        }
        uint256 outstandingUnderlying = IInitLendingPool(safePool).debtShareToAmtCurrent(outstandingShares);
        if (amount >= outstandingUnderlying) {
            repayShares = outstandingShares; // full close (pulls <= amount)
        } else {
            repayShares = (outstandingShares * amount) / outstandingUnderlying; // round down
            if (repayShares == 0) {
                IERC20(safeUnderlying).safeTransfer(msg.sender, amount);
                return 0;
            }
        }

        IERC20(safeUnderlying).forceApprove(address(core), amount);
        uint256 repaid = core.repay(safePool, repayShares, posId);
        IERC20(safeUnderlying).forceApprove(address(core), 0);

        // Return any unspent USDC (Core only pulls the exact repaid amount).
        uint256 leftover = IERC20(safeUnderlying).balanceOf(address(this));
        if (leftover > 0) IERC20(safeUnderlying).safeTransfer(msg.sender, leftover);

        return repaid;
    }

    /// @notice Withdraw up to `amount` of the collateral underlying (USDY):
    /// decollateralize the matching inUSDY shares (capped at the position's
    /// holdings), redeem them to USDY, and forward to `to`. Returns USDY sent.
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        if (asset != riskUnderlying) revert UnsupportedAsset();
        if (posId == 0) revert NoPosition();

        // Size inUSDY shares for `amount` of underlying, proportional to what the
        // position holds (no on-pool amount->share helper exists for collateral).
        uint256 heldShares = _collShares();
        if (heldShares == 0) return 0;
        uint256 heldUnderlying = IInitLendingPool(riskPool).toAmtCurrent(heldShares);

        uint256 shares;
        if (amount >= heldUnderlying) {
            shares = heldShares; // full withdraw
        } else {
            shares = (heldShares * amount) / heldUnderlying;
            if (shares == 0) return 0;
        }

        // decollateralize sends inUSDY shares back to this adapter...
        core.decollateralize(posId, riskPool, shares, address(this));
        // ...then redeem them to USDY via the transfer-then-call burn.
        uint256 inBal = IERC20(riskPool).balanceOf(address(this));
        IERC20(riskPool).safeTransfer(riskPool, inBal);
        uint256 underlyingOut = core.burnTo(riskPool, address(this));

        IERC20(riskUnderlying).safeTransfer(to, underlyingOut);
        return underlyingOut;
    }

    // -------------------------------------------------------------------------
    //                          VIEWS (for totalAssets)
    // -------------------------------------------------------------------------

    /// @notice Current collateral expressed in the collateral UNDERLYING (USDY,
    /// 18 dec). 0 if no position. Uses the pool's stale (last-accrued) rate so
    /// it is `view`-callable from the vault's `totalAssets()`.
    function collateralUnderlying() external view returns (uint256) {
        if (posId == 0) return 0;
        (address[] memory pools, uint256[] memory amts,,,) = IInitPosManager(posManager).getPosCollInfo(posId);
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == riskPool) {
                return IInitLendingPool(riskPool).toAmt(amts[i]);
            }
        }
        return 0;
    }

    /// @notice Current debt expressed in the borrow UNDERLYING (USDC, 6 dec).
    /// 0 if no position. Uses the pool's stored (last-accrued) rate so it is
    /// `view`-callable from the vault's `totalAssets()`.
    function debtUnderlying() external view returns (uint256) {
        if (posId == 0) return 0;
        (address[] memory pools, uint256[] memory debtShares) = IInitPosManager(posManager).getPosBorrInfo(posId);
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == safePool) {
                return IInitLendingPool(safePool).debtShareToAmtStored(debtShares[i]);
            }
        }
        return 0;
    }

    // -------------------------------------------------------------------------
    //                               internals
    // -------------------------------------------------------------------------

    function _collShares() internal view returns (uint256) {
        (address[] memory pools, uint256[] memory amts,,,) = IInitPosManager(posManager).getPosCollInfo(posId);
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == riskPool) return amts[i];
        }
        return 0;
    }

    function _debtShares() internal view returns (uint256) {
        (address[] memory pools, uint256[] memory debtShares) = IInitPosManager(posManager).getPosBorrInfo(posId);
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == safePool) return debtShares[i];
        }
        return 0;
    }
}
