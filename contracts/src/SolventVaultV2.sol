// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Policy, ActionType, Regime, PolicyLib} from "./Policy.sol";
import {SolventAttestation} from "./SolventAttestation.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";
import {ILendingVenue} from "./interfaces/ILendingVenue.sol";

/// @notice ERC-4626 vault for the Solvent depeg-guardian product. Shares
/// (`svUSDT0`) track deposits 1:1 nominally; the agent may execute pre-approved
/// protective actions (SWAP_TO_SAFE etc.) that change the vault composition
/// without changing share value (because `totalAssets()` counts the safe asset
/// at nominal 1:1 — the same assumption `policy.maxSlippageBps` uses).
contract SolventVaultV2 is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PolicyLib for Policy;
    using SafeCast for uint256;

    uint256 public immutable agentId;
    SolventAttestation public immutable attestation;

    address public owner;
    address public agent;
    bool public killSwitch;
    Policy public policy;
    IDexRouter public dexRouter;
    ILendingVenue public yieldVenue;

    error NotOwner();
    error NotAgent();
    error Killed();
    error NotKilled();
    error ActionNotAllowed(ActionType action);
    error ZeroAddress();
    error ZeroShares();
    error EmptyVault();
    error SlippageFloorBreached();
    error BadSwapPath();
    error BorrowExceedsMaxLTV();

    event AgentChanged(address indexed agent);
    event PolicyChanged();
    event KillSwitchSet(bool active);
    event DexRouterChanged(address indexed router);
    event YieldVenueChanged(address indexed venue);
    event ProtectiveActionExecuted(ActionType indexed action, int256 outcome);
    event Rescued(address indexed token, uint256 amount, address indexed to);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RedeemedAll(address indexed caller, address indexed receiver, uint256 assetOut, uint256 safeOut, uint256 shares);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(
        address asset_,
        address owner_,
        address agent_,
        uint256 agentId_,
        address attestation_,
        Policy memory policy_
    )
        ERC20("Solvent svUSDT0", "svUSDT0")
        ERC4626(IERC20(asset_))
    {
        if (owner_ == address(0) || asset_ == address(0) || attestation_ == address(0)) {
            revert ZeroAddress();
        }
        if (policy_.safeAsset == address(0)) revert ZeroAddress();
        owner = owner_;
        agent = agent_;
        agentId = agentId_;
        attestation = SolventAttestation(attestation_);
        policy = policy_;
    }

    // --- ERC4626 overrides ---

    /// @notice Total assets = vault's risk-asset balance + safe-asset balance
    /// at nominal 1:1 (decimal-aware). Preserves share value across a
    /// protective swap, since the safe units received credit the same total.
    function totalAssets() public view override returns (uint256) {
        uint256 assetBal = IERC20(asset()).balanceOf(address(this));
        uint256 safeBal = IERC20(policy.safeAsset).balanceOf(address(this));
        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 safeInAssetUnits = (safeBal * (10 ** ad)) / (10 ** sd);
        return assetBal + safeInAssetUnits;
    }

    // --- owner setters (mirror V1 surface verbatim) ---

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setPolicy(Policy calldata policy_) external onlyOwner {
        if (policy_.safeAsset == address(0)) revert ZeroAddress();
        policy = policy_;
        emit PolicyChanged();
    }

    function setKillSwitch(bool active) external onlyOwner {
        killSwitch = active;
        emit KillSwitchSet(active);
    }

    function setDexRouter(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        dexRouter = IDexRouter(router);
        emit DexRouterChanged(router);
    }

    function setYieldVenue(address venue) external onlyOwner {
        if (venue == address(0)) revert ZeroAddress();
        yieldVenue = ILendingVenue(venue);
        emit YieldVenueChanged(venue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // --- agent surface (copied verbatim from V1 — same params, same checks) ---

    function executeProtectiveAction(
        ActionType action,
        bytes calldata params,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        string calldata uri
    ) external onlyAgent nonReentrant {
        if (killSwitch) revert Killed();
        if (!policy.isActionAllowed(action)) revert ActionNotAllowed(action);

        int256 outcome;
        if (action == ActionType.SWAP_TO_SAFE) {
            outcome = _swapToSafe(params);
        } else if (action == ActionType.BRIDGE_VIA_LENDING) {
            outcome = _bridgeViaLending(params);
        } else if (action == ActionType.UNWIND_BRIDGE) {
            outcome = _unwindBridge(params);
        } else if (action == ActionType.PARK_YIELD) {
            outcome = _parkYield(params);
        } else {
            revert ActionNotAllowed(action);
        }

        emit ProtectiveActionExecuted(action, outcome);
        attestation.record(agentId, regime, reasonCode, signalsHash, action, outcome, uri);
    }

    function attestObservation(Regime regime, bytes32 reasonCode, bytes32 signalsHash, string calldata uri)
        external
        onlyAgent
    {
        // Intentionally NOT killSwitch-gated: observations move no funds.
        attestation.record(agentId, regime, reasonCode, signalsHash, ActionType.NONE, 0, uri);
    }

    function _swapToSafe(bytes calldata params) internal returns (int256) {
        (uint256 amountIn, uint256 amountOutMin, address[] memory path) =
            abi.decode(params, (uint256, uint256, address[]));

        if (path.length < 2 || path[0] != asset() || path[path.length - 1] != policy.safeAsset) {
            revert BadSwapPath();
        }
        if (address(dexRouter) == address(0)) revert ZeroAddress();

        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 floor = (amountIn * (10000 - policy.maxSlippageBps) * (10 ** sd)) / (10000 * (10 ** ad));
        if (amountOutMin < floor) revert SlippageFloorBreached();

        IERC20(asset()).forceApprove(address(dexRouter), amountIn);
        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        dexRouter.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);
        uint256 received = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        IERC20(asset()).forceApprove(address(dexRouter), 0);
        return received.toInt256();
    }

    function _bridgeViaLending(bytes calldata params) internal returns (int256) {
        (uint256 collateralAmount, uint256 borrowAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        uint8 ad = IERC20Metadata(asset()).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 maxBorrow =
            (collateralAmount * policy.maxBridgeLTVBps * (10 ** sd)) / (10000 * (10 ** ad));
        if (borrowAmount > maxBorrow) revert BorrowExceedsMaxLTV();

        IERC20(asset()).forceApprove(address(venue), collateralAmount);
        venue.supply(asset(), collateralAmount, address(this));
        IERC20(asset()).forceApprove(address(venue), 0);

        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        venue.borrow(policy.safeAsset, borrowAmount, address(this));
        uint256 borrowed = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        return borrowed.toInt256();
    }

    function _unwindBridge(bytes calldata params) internal returns (int256) {
        (uint256 repayAmount, uint256 withdrawAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        IERC20(policy.safeAsset).forceApprove(address(venue), repayAmount);
        venue.repay(policy.safeAsset, repayAmount, address(this));
        IERC20(policy.safeAsset).forceApprove(address(venue), 0);

        uint256 balBefore = IERC20(asset()).balanceOf(address(this));
        venue.withdraw(asset(), withdrawAmount, address(this));
        return (IERC20(asset()).balanceOf(address(this)) - balBefore).toInt256();
    }

    function _parkYield(bytes calldata params) internal returns (int256) {
        uint256 amount = abi.decode(params, (uint256));
        if (address(yieldVenue) == address(0)) revert ZeroAddress();
        uint256 balBefore = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).forceApprove(address(yieldVenue), amount);
        yieldVenue.supply(asset(), amount, address(this));
        IERC20(asset()).forceApprove(address(yieldVenue), 0);
        uint256 supplied = balBefore - IERC20(asset()).balanceOf(address(this));
        return supplied.toInt256();
    }

    // --- redeemAll: pro-rata mix of asset + safe-asset out ---

    /// @notice Non-standard redemption that hands the receiver their pro-rata
    /// share of BOTH the risk asset and the safe asset. Useful when the vault
    /// is in safe mode (post-`SWAP_TO_SAFE`) and standard `redeem(asset)` would
    /// revert because the vault holds zero risk asset. Always callable — does
    /// NOT enforce a safe-mode precondition.
    function redeemAll(uint256 shares, address receiver) external nonReentrant {
        if (shares == 0) revert ZeroShares();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 supply = totalSupply();
        if (supply == 0) revert EmptyVault();

        uint256 assetBal = IERC20(asset()).balanceOf(address(this));
        uint256 safeBal  = IERC20(policy.safeAsset).balanceOf(address(this));
        uint256 assetOut = (assetBal * shares) / supply;
        uint256 safeOut  = (safeBal  * shares) / supply;

        _burn(msg.sender, shares);

        if (assetOut > 0) IERC20(asset()).safeTransfer(receiver, assetOut);
        if (safeOut  > 0) IERC20(policy.safeAsset).safeTransfer(receiver, safeOut);

        emit Withdraw(msg.sender, receiver, msg.sender, assetOut, shares);
        emit RedeemedAll(msg.sender, receiver, assetOut, safeOut, shares);
    }

    // --- emergency rescue (owner-only, kill-switch-gated) ---

    /// @notice Last-resort escape if shares accounting breaks. Only callable
    /// when killSwitch == true. Owner withdraws an arbitrary token to an
    /// arbitrary address.
    function rescue(address token, uint256 amount, address to) external onlyOwner {
        if (!killSwitch) revert NotKilled();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, amount, to);
    }
}
