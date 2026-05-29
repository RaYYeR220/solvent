// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Highly simplified InitCore mock for unit tests. One position;
/// bookkeeping in plain amounts (no shares). Real INIT uses share math.
contract MockInitCore {
    struct Position {
        address collToken;
        uint256 collAmount;
        address debtToken;
        uint256 debtAmount;
    }

    mapping(uint256 => Position) public positions;
    uint256 public nextPosId = 1;

    function createPos(uint16, address) external returns (uint256 posId) {
        posId = nextPosId++;
    }

    function collateralize(uint256 posId, address collToken, uint256 amount) external {
        IERC20(collToken).transferFrom(msg.sender, address(this), amount);
        Position storage p = positions[posId];
        p.collToken = collToken;
        p.collAmount += amount;
    }

    function borrow(uint256 posId, address debtToken, uint256 amount) external {
        Position storage p = positions[posId];
        p.debtToken = debtToken;
        p.debtAmount += amount;
        IERC20(debtToken).transfer(msg.sender, amount);
    }

    function repay(uint256 posId, address debtToken, uint256 amount) external {
        IERC20(debtToken).transferFrom(msg.sender, address(this), amount);
        Position storage p = positions[posId];
        require(p.debtToken == debtToken, "MockInitCore: wrong debt token");
        if (amount > p.debtAmount) amount = p.debtAmount;
        p.debtAmount -= amount;
    }

    function decollateralize(uint256 posId, address collToken, uint256 amount, address recipient) external {
        Position storage p = positions[posId];
        require(p.collToken == collToken, "MockInitCore: wrong coll token");
        require(amount <= p.collAmount, "MockInitCore: insufficient collateral");
        p.collAmount -= amount;
        IERC20(collToken).transfer(recipient, amount);
    }

    function fundDebtToken(address debtToken, uint256 amount) external {
        // Test helper: pre-fund this contract with debt token so it can lend.
        IERC20(debtToken).transferFrom(msg.sender, address(this), amount);
    }
}
