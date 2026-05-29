// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SolventVault} from "../src/SolventVault.sol";

/// @notice One-shot migration: deployer (current owner) transfers the
/// ERC-8004 Identity NFT to a fresh agent EOA, sets `vault.agent` to that
/// EOA, and optionally funds the EOA with native MNT for gas.
///
/// Under `forge script ... --broadcast`, each external call inside the
/// broadcast block is broadcast as a separate tx from the broadcaster EOA
/// (NOT from this contract). `msg.sender` inside the target contracts is
/// therefore the deployer EOA. Invoke ONLY with `--private-key` (no
/// `--sender` override). Foundry derives the broadcaster from the key; if
/// `--sender` is passed independently, the `msg.sender` inside this script
/// can diverge from the broadcasting EOA, causing the inner `transferFrom`
/// /`setAgent` calls to revert at simulation. This semantics is
/// broadcast-specific — `vm.prank` does not behave the same way, so tests
/// simulate the broadcast by sequencing three manual `vm.prank(deployer)`
/// calls.
contract MigrateAgent is Script {
    function run(
        address registry_,
        address vault_,
        uint256 agentId_,
        address newAgent_,
        uint256 fundAmount_
    ) external {
        require(registry_ != address(0), "zero registry");
        require(vault_ != address(0), "zero vault");
        require(newAgent_ != address(0), "zero newAgent");
        vm.startBroadcast();
        IERC721(registry_).transferFrom(msg.sender, newAgent_, agentId_);
        SolventVault(vault_).setAgent(newAgent_);
        if (fundAmount_ > 0) {
            (bool ok, ) = newAgent_.call{value: fundAmount_}("");
            require(ok, "fund transfer failed");
        }
        vm.stopBroadcast();
    }
}
