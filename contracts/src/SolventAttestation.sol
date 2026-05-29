// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ActionType, Regime} from "./Policy.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @notice Append-only log of agent decisions, keyed by the calling vault and
/// tagged with the agent's ERC-8004 identity id. Permissionless to write;
/// each record carries `msg.sender` so consumers filter by vault. This is the
/// verifiable "Turing-test transcript".
///
/// Each `record()` call also mirrors a feedback entry to an external ERC-8004
/// Reputation Registry, if one is configured. The mirror is best-effort — a
/// reverting registry MUST NOT block the internal log.
contract SolventAttestation {
    string private constant TAG_NAMESPACE = "solvent.depeg-guardian";
    int128 private constant MIRROR_SCORE_VALUE = int128(100);
    uint8 private constant MIRROR_SCORE_DECIMALS = uint8(0);

    struct Decision {
        uint256 agentId;
        uint64 timestamp;
        Regime regime;
        bytes32 reasonCode;
        bytes32 signalsHash;
        ActionType action;
        int256 outcome; // signed: safe-asset units preserved/gained (+) or lost (-)
        string uri;     // ERC-8004 mirror URI (ipfs:// or data:)
    }

    /// @notice Mantle ERC-8004 ReputationRegistry, or address(0) for local-only mode.
    IReputationRegistry public immutable reputationRegistry;

    mapping(address => Decision[]) private _decisions; // vault => decisions

    event DecisionRecorded(
        uint256 indexed agentId,
        address indexed vault,
        uint256 indexed index,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome,
        string uri
    );

    event MirrorFailed(uint256 indexed agentId, bytes32 indexed reasonCode, bytes reason);

    constructor(address reputationRegistry_) {
        reputationRegistry = IReputationRegistry(reputationRegistry_);
    }

    function record(
        uint256 agentId,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome,
        string calldata uri
    ) external returns (uint256 index) {
        index = _decisions[msg.sender].length;
        _decisions[msg.sender].push(
            Decision({
                agentId: agentId,
                timestamp: uint64(block.timestamp),
                regime: regime,
                reasonCode: reasonCode,
                signalsHash: signalsHash,
                action: action,
                outcome: outcome,
                uri: uri
            })
        );
        emit DecisionRecorded(agentId, msg.sender, index, regime, reasonCode, signalsHash, action, outcome, uri);

        if (address(reputationRegistry) != address(0)) {
            bytes32 feedbackHash = keccak256(
                abi.encode(agentId, regime, reasonCode, signalsHash, action, outcome, uri)
            );
            // Best-effort mirror. A reverting registry must not block the internal log.
            try reputationRegistry.giveFeedback(
                agentId,
                MIRROR_SCORE_VALUE,
                MIRROR_SCORE_DECIMALS,
                TAG_NAMESPACE,
                Strings.toHexString(uint256(reasonCode)),
                "",
                uri,
                feedbackHash
            ) {
                // ok
            } catch (bytes memory reason) {
                emit MirrorFailed(agentId, reasonCode, reason);
            }
        }
    }

    function decisionCount(address vault) external view returns (uint256) {
        return _decisions[vault].length;
    }

    function decisionAt(address vault, uint256 index)
        external
        view
        returns (
            uint256 agentId,
            uint64 timestamp,
            Regime regime,
            bytes32 reasonCode,
            bytes32 signalsHash,
            ActionType action,
            int256 outcome,
            string memory uri
        )
    {
        Decision storage d = _decisions[vault][index];
        return (d.agentId, d.timestamp, d.regime, d.reasonCode, d.signalsHash, d.action, d.outcome, d.uri);
    }
}
