// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of the ERC-8004 Reputation Registry the
/// SolventAttestation contract uses to mirror agent decisions to the
/// Mantle-deployed ecosystem registry.
///
/// Verified against upstream ABI 2026-05-29:
///   https://github.com/erc-8004/erc-8004-contracts/blob/main/abis/ReputationRegistry.json
///
/// IMPORTANT — upstream shape differs from the plan's initial assumption:
///   - score (uint8) → split into `value` (int128) + `valueDecimals` (uint8)
///   - tag (bytes32)  → two string tags: `tag1` and `tag2`
///   - uri (string)   → renamed `feedbackURI`; added `endpoint` (string) and
///                       `feedbackHash` (bytes32) params
///   - return type    → void (no feedbackId returned)
///
/// Callers (Task 3 dual-write logic) must use this exact signature.
interface IReputationRegistry {
    /// @param agentId       The ERC-8004 identity ID registered by the agent.
    /// @param value         Signed fixed-point feedback score (e.g. 100_00 = 100.00
    ///                      when valueDecimals == 2). Use positive values for
    ///                      routine attestations; lower/negative if risk elevated.
    /// @param valueDecimals Number of decimal places in `value`.
    /// @param tag1          Primary classification tag (free-form string,
    ///                      e.g. "park-calm", "depeg-risk").
    /// @param tag2          Secondary classification tag (may be empty string).
    /// @param endpoint      Canonical endpoint URI the feedback targets
    ///                      (e.g. agent API URL or contract address string).
    /// @param feedbackURI   URI pointing to the rich decision JSON
    ///                      (ipfs:// or data:).
    /// @param feedbackHash  keccak256 of the canonical feedback payload for
    ///                      tamper-evidence.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}
