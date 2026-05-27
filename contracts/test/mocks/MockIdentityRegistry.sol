// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    uint256 public nextId = 1;
    mapping(uint256 => address) public owners;

    function register(string calldata) external returns (uint256 agentId) {
        agentId = nextId++;
        owners[agentId] = msg.sender;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }
}
