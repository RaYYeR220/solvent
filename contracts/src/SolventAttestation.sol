// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ActionType, Regime} from "./Policy.sol";

/// @notice Append-only log of agent decisions, keyed by the calling vault and
/// tagged with the agent's ERC-8004 identity id. Permissionless to write;
/// each record carries `msg.sender` so consumers filter by vault. This is the
/// verifiable "Turing-test transcript".
contract SolventAttestation {
    struct Decision {
        uint256 agentId;
        uint64 timestamp;
        Regime regime;
        bytes32 reasonCode;
        bytes32 signalsHash;
        ActionType action;
        int256 outcome; // signed: value preserved/gained (+) or realized loss (-), in safe-asset units
    }

    mapping(address => Decision[]) private _decisions; // vault => decisions

    event DecisionRecorded(
        uint256 indexed agentId,
        address indexed vault,
        uint256 indexed index,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome
    );

    function record(
        uint256 agentId,
        Regime regime,
        bytes32 reasonCode,
        bytes32 signalsHash,
        ActionType action,
        int256 outcome
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
                outcome: outcome
            })
        );
        emit DecisionRecorded(agentId, msg.sender, index, regime, reasonCode, signalsHash, action, outcome);
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
            int256 outcome
        )
    {
        Decision storage d = _decisions[vault][index];
        return (d.agentId, d.timestamp, d.regime, d.reasonCode, d.signalsHash, d.action, d.outcome);
    }
}
