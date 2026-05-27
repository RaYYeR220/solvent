// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Policy, ActionType, PolicyLib} from "../src/Policy.sol";

contract PolicyTest is Test {
    using PolicyLib for Policy;

    function _policyAllowing(ActionType a) internal pure returns (Policy memory p) {
        p.allowedActions = uint32(1) << uint8(a);
    }

    function test_allowedActionReturnsTrue() public pure {
        Policy memory p = _policyAllowing(ActionType.SWAP_TO_SAFE);
        assertTrue(p.isActionAllowed(ActionType.SWAP_TO_SAFE));
    }

    function test_disallowedActionReturnsFalse() public pure {
        Policy memory p = _policyAllowing(ActionType.SWAP_TO_SAFE);
        assertFalse(p.isActionAllowed(ActionType.BRIDGE_VIA_LENDING));
    }

    function test_multipleAllowedActions() public pure {
        Policy memory p;
        p.allowedActions =
            (uint32(1) << uint8(ActionType.SWAP_TO_SAFE)) |
            (uint32(1) << uint8(ActionType.PARK_YIELD));
        assertTrue(p.isActionAllowed(ActionType.SWAP_TO_SAFE));
        assertTrue(p.isActionAllowed(ActionType.PARK_YIELD));
        assertFalse(p.isActionAllowed(ActionType.BRIDGE_VIA_LENDING));
    }

    function test_noneIsNeverAllowed() public pure {
        Policy memory p;
        p.allowedActions = type(uint32).max;
        assertFalse(p.isActionAllowed(ActionType.NONE));
    }
}
