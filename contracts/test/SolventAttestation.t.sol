// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {ActionType, Regime} from "../src/Policy.sol";

contract SolventAttestationTest is Test {
    SolventAttestation att;

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

    function setUp() public {
        att = new SolventAttestation(address(0));
    }

    function test_recordStoresDecisionAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit DecisionRecorded(
            7, address(this), 0, Regime.EARLY_DEPEG, bytes32("early-exit"),
            keccak256("signals"), ActionType.SWAP_TO_SAFE, int256(99e6), ""
        );

        att.record(
            7, Regime.EARLY_DEPEG, bytes32("early-exit"),
            keccak256("signals"), ActionType.SWAP_TO_SAFE, int256(99e6), ""
        );

        assertEq(att.decisionCount(address(this)), 1);
        (uint256 agentId,, Regime regime,,, ActionType action, int256 outcome,) =
            att.decisionAt(address(this), 0);
        assertEq(agentId, 7);
        assertEq(uint8(regime), uint8(Regime.EARLY_DEPEG));
        assertEq(uint8(action), uint8(ActionType.SWAP_TO_SAFE));
        assertEq(outcome, int256(99e6));
    }

    function test_indexIncrementsPerVault() public {
        att.record(1, Regime.WATCH, bytes32("watch"), bytes32(0), ActionType.NONE, 0, "");
        att.record(1, Regime.CALM, bytes32("park"), bytes32(0), ActionType.PARK_YIELD, 0, "");
        assertEq(att.decisionCount(address(this)), 2);
    }
}
