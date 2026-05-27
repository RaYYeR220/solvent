// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Policy, ActionType, Regime, PolicyLib} from "./Policy.sol"; // ActionType, Regime, PolicyLib used in Tasks 6-8
import {SolventAttestation} from "./SolventAttestation.sol";

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

    error NotOwner();
    error NotAgent();
    error Killed();
    error ActionNotAllowed(ActionType action);
    error ZeroAddress();

    event AgentChanged(address indexed agent);
    event PolicyChanged();
    event KillSwitchSet(bool active);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

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
}
