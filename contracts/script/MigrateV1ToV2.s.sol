// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISolventVaultV1 {
    function asset() external view returns (address);
    function owner() external view returns (address);
    function killSwitch() external view returns (bool);
    function withdraw(uint256 amount) external;
    function withdrawToken(address token, uint256 amount) external;
    function setKillSwitch(bool active) external;
}

/// @notice Owner-only V1 -> V2 migration. Drains any residual asset balance
/// out of V1 back to the owner, then kill-switches V1 so the deprecated
/// instance is inert. New V2 deployment is handled by DeployV2.s.sol — this
/// script does NOT seed V2 with an initial deposit (left for a live test from
/// a fresh wallet so the multi-user flow is exercised end-to-end).
contract MigrateV1ToV2 is Script {
    address constant V1_VAULT = 0x06513470e16a7d6071A12708c38a6fa0ED66469c;

    function run() external {
        vm.startBroadcast();

        ISolventVaultV1 v1 = ISolventVaultV1(V1_VAULT);
        address assetAddr = v1.asset();
        uint256 bal = IERC20(assetAddr).balanceOf(V1_VAULT);
        if (bal > 0) {
            console.log("V1 has residual asset balance:", bal);
            v1.withdraw(bal);
            console.log("  drained to owner");
        } else {
            console.log("V1 has zero asset balance - skipping withdraw");
        }

        if (!v1.killSwitch()) {
            v1.setKillSwitch(true);
            console.log("V1 kill switch set");
        } else {
            console.log("V1 kill switch already on - no-op");
        }

        vm.stopBroadcast();
    }
}
