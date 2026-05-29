// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {ActionType, Regime} from "../src/Policy.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";

contract SolventAttestationDualWriteTest is Test {
    SolventAttestation att;
    MockReputationRegistry reg;

    function setUp() public {
        reg = new MockReputationRegistry();
        att = new SolventAttestation(address(reg));
    }

    function test_recordMirrorsToReputationRegistry() public {
        bytes32 reason = keccak256("park-calm");
        bytes32 sigHash = bytes32(uint256(0xdeadbeef));
        string memory uri = "ipfs://bafy.../decision.json";

        att.record(42, Regime.CALM, reason, sigHash, ActionType.PARK_YIELD, int256(0), uri);

        assertEq(reg.feedbackCount(), 1);

        // Read feedback fields in separate scopes to avoid stack-too-deep.
        {
            (uint256 agentId, int128 value, uint8 valueDecimals,,,,,, ) = reg.feedbacks(0);
            assertEq(agentId, 42);
            assertEq(value, int128(100));
            assertEq(valueDecimals, uint8(0));
        }
        {
            (,,,string memory tag1, string memory tag2, string memory endpoint,,, ) = reg.feedbacks(0);
            assertEq(tag1, "solvent.depeg-guardian");
            assertEq(tag2, Strings.toHexString(uint256(reason)));
            assertEq(endpoint, "");
        }
        {
            (,,,,,, string memory feedbackURI, bytes32 feedbackHash, address from) = reg.feedbacks(0);
            assertEq(feedbackURI, uri);
            bytes32 expected = keccak256(
                abi.encode(uint256(42), Regime.CALM, reason, sigHash, ActionType.PARK_YIELD, int256(0), uri)
            );
            assertEq(feedbackHash, expected);
            assertEq(from, address(att));
        }
    }

    function test_recordSkipsMirrorWhenRegistryUnset() public {
        SolventAttestation attNoReg = new SolventAttestation(address(0));
        // Should not revert even though no registry is set.
        attNoReg.record(7, Regime.CALM, bytes32("park"), bytes32(0), ActionType.PARK_YIELD, 0, "");
        // Internal log still populated:
        assertEq(attNoReg.decisionCount(address(this)), 1);
    }

    function test_recordContinuesWhenMirrorReverts() public {
        reg.setShouldRevert(true);
        // The dual-write wraps the external call in try/catch; the internal log
        // must still record the decision even if the registry call fails.
        att.record(1, Regime.WATCH, bytes32("observe"), bytes32(0), ActionType.NONE, 0, "data:,foo");
        assertEq(att.decisionCount(address(this)), 1);
        assertEq(reg.feedbackCount(), 0);
    }
}
