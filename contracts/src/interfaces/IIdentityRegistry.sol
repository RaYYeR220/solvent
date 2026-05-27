// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of the ERC-8004 Identity Registry the deploy
/// script uses to mint the agent's identity passport.
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}
