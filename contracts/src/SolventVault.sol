// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Policy, ActionType, Regime, PolicyLib} from "./Policy.sol"; // ActionType, Regime, PolicyLib used in Tasks 6-8
import {SolventAttestation} from "./SolventAttestation.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";
import {ILendingVenue} from "./interfaces/ILendingVenue.sol";

/// @notice Custody + on-chain policy enforcement. The agent may only execute
/// pre-approved protective actions; it can never withdraw to an arbitrary
/// address. The owner can always withdraw and can flip the kill switch.
contract SolventVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PolicyLib for Policy;

    IERC20 public immutable asset;
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
    error ActionNotAllowed(ActionType action);
    error ZeroAddress();
    error SlippageFloorBreached();
    error BadSwapPath();
    error BorrowExceedsMaxLTV();

    event AgentChanged(address indexed agent);
    event PolicyChanged();
    event KillSwitchSet(bool active);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event DexRouterChanged(address indexed router);
    event YieldVenueChanged(address indexed venue);
    event ProtectiveActionExecuted(ActionType indexed action, int256 outcome);

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
    ) {
        if (owner_ == address(0) || asset_ == address(0) || attestation_ == address(0)) {
            revert ZeroAddress();
        }
        asset = IERC20(asset_);
        owner = owner_;
        agent = agent_;
        agentId = agentId_;
        attestation = SolventAttestation(attestation_);
        policy = policy_;
    }

    // --- owner surface ---

    function deposit(uint256 amount) external onlyOwner {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(amount);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(amount);
    }

    /// @dev Pass address(0) to disable the agent role (no protective actions possible).
    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setPolicy(Policy calldata policy_) external onlyOwner {
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

    // --- agent surface ---

    function executeProtectiveAction(
        ActionType action,
        bytes calldata params,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash
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
            // Other actions are wired up in later tasks.
            revert ActionNotAllowed(action);
        }

        emit ProtectiveActionExecuted(action, outcome);
        attestation.record(agentId, regime, reasonCode, signalsHash, action, outcome);
    }

    /// @dev Enforces: the path starts at `asset` and ends at the policy safe
    /// asset, and amountOutMin is not below the policy slippage floor (assuming a
    /// 1:1 nominal peg between asset and safe stable). The off-chain agent is
    /// expected to call with economically meaningful amounts; at dust amounts the
    /// integer floor can round to zero. Returns safe-asset units received.
    function _swapToSafe(bytes calldata params) internal returns (int256) {
        (uint256 amountIn, uint256 amountOutMin, address[] memory path) =
            abi.decode(params, (uint256, uint256, address[]));

        if (path.length < 2 || path[0] != address(asset) || path[path.length - 1] != policy.safeAsset) {
            revert BadSwapPath();
        }
        if (address(dexRouter) == address(0)) revert ZeroAddress();

        uint8 ad = IERC20Metadata(address(asset)).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 floor = (amountIn * (10000 - policy.maxSlippageBps) * (10 ** sd)) / (10000 * (10 ** ad));
        if (amountOutMin < floor) revert SlippageFloorBreached();

        IERC20(address(asset)).forceApprove(address(dexRouter), amountIn);
        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        // deadline == block.timestamp: the slippage floor (not the deadline) is the real guard here
        dexRouter.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);
        uint256 received = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        IERC20(address(asset)).forceApprove(address(dexRouter), 0); // revoke any residual allowance
        return int256(received);
    }

    /// @dev Supplies `asset` collateral to the policy bridge venue and borrows
    /// the safe asset, capped at maxBridgeLTV. NOTE: the LTV cap is NOMINAL
    /// (assumes a 1:1 collateral/safe-asset peg), not mark-to-market. Returns
    /// safe-asset units actually borrowed.
    function _bridgeViaLending(bytes calldata params) internal returns (int256) {
        (uint256 collateralAmount, uint256 borrowAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        uint8 ad = IERC20Metadata(address(asset)).decimals();
        uint8 sd = IERC20Metadata(policy.safeAsset).decimals();
        uint256 maxBorrow =
            (collateralAmount * policy.maxBridgeLTVBps * (10 ** sd)) / (10000 * (10 ** ad));
        if (borrowAmount > maxBorrow) revert BorrowExceedsMaxLTV();

        IERC20(address(asset)).forceApprove(address(venue), collateralAmount);
        venue.supply(address(asset), collateralAmount, address(this));
        IERC20(address(asset)).forceApprove(address(venue), 0); // revoke residual

        uint256 balBefore = IERC20(policy.safeAsset).balanceOf(address(this));
        venue.borrow(policy.safeAsset, borrowAmount, address(this));
        uint256 borrowed = IERC20(policy.safeAsset).balanceOf(address(this)) - balBefore;
        return int256(borrowed);
    }

    /// @dev Repays safe-asset debt and withdraws collateral back into the vault.
    /// Returns collateral units actually withdrawn.
    function _unwindBridge(bytes calldata params) internal returns (int256) {
        (uint256 repayAmount, uint256 withdrawAmount) = abi.decode(params, (uint256, uint256));
        if (policy.bridgeVenue == address(0)) revert ZeroAddress();
        ILendingVenue venue = ILendingVenue(policy.bridgeVenue);

        IERC20(policy.safeAsset).forceApprove(address(venue), repayAmount);
        venue.repay(policy.safeAsset, repayAmount, address(this));
        IERC20(policy.safeAsset).forceApprove(address(venue), 0); // revoke residual

        uint256 actualWithdrawn = venue.withdraw(address(asset), withdrawAmount, address(this));
        return int256(actualWithdrawn);
    }

    /// @dev Parks idle capital by supplying `asset` to the configured yield
    /// venue. Returns the asset units actually supplied.
    function _parkYield(bytes calldata params) internal returns (int256) {
        uint256 amount = abi.decode(params, (uint256));
        if (address(yieldVenue) == address(0)) revert ZeroAddress();
        uint256 balBefore = asset.balanceOf(address(this));
        IERC20(address(asset)).forceApprove(address(yieldVenue), amount);
        yieldVenue.supply(address(asset), amount, address(this));
        IERC20(address(asset)).forceApprove(address(yieldVenue), 0); // revoke residual
        uint256 supplied = balBefore - asset.balanceOf(address(this));
        return int256(supplied);
    }

    /// @notice Records a no-action observation (e.g. WATCH regime) to the
    /// attestation log without moving funds.
    function attestObservation(Regime regime, bytes32 reasonCode, bytes32 signalsHash)
        external
        onlyAgent
    {
        attestation.record(agentId, regime, reasonCode, signalsHash, ActionType.NONE, 0);
    }
}
