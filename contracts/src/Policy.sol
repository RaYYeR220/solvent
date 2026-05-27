// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Ordered so the bitmap `1 << uint8(action)` is stable. NONE must be 0.
enum ActionType {
    NONE,
    SWAP_TO_SAFE,
    BRIDGE_VIA_LENDING,
    UNWIND_BRIDGE,
    PARK_YIELD
}

enum Regime {
    CALM,
    WATCH,
    EARLY_DEPEG,
    TERMINAL_DEPEG
}

/// @notice User-set risk policy. Fields consumed off-chain by the agent
/// (divergence thresholds, liquidity floor) are stored on-chain for
/// verifiability; fields enforced on-chain by the vault are noted below.
struct Policy {
    uint16 earlyDivergenceBps;    // off-chain: WATCH -> EARLY trigger
    uint16 terminalDivergenceBps; // off-chain: EARLY -> TERMINAL trigger
    uint256 liquidityFloor;       // off-chain: min acceptable pool depth
    uint16 maxSlippageBps;        // ON-CHAIN: swap floor vs assumed 1:1 safe peg
    address safeAsset;            // ON-CHAIN: only allowed swap/borrow output
    address bridgeVenue;          // ON-CHAIN: only allowed lending venue
    uint16 maxBridgeLTVBps;       // ON-CHAIN: cap on borrow/collateral ratio
    uint32 allowedActions;        // ON-CHAIN: bitmap over ActionType
}

library PolicyLib {
    function isActionAllowed(Policy memory p, ActionType action) internal pure returns (bool) {
        if (action == ActionType.NONE) return false;
        return (p.allowedActions & (uint32(1) << uint8(action))) != 0;
    }
}
