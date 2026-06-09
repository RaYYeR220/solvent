// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SolventVaultV2_1} from "../src/SolventVaultV2_1.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {ILendingVenue} from "../src/interfaces/ILendingVenue.sol";
import {ILendingViews} from "../src/interfaces/ILendingViews.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Mock INIT-style lending venue that implements the `ILendingVenue`
/// surface the vault drives AND the `ILendingViews` position reads the V2.1
/// `totalAssets()` consumes. Tracks ONE position: collateral in the COLLATERAL
/// underlying's own units (USDY, 18 dec) and debt in the BORROW underlying's
/// units (USDC, 6 dec) — mirroring `InitLendingAdapterV2`. Must be pre-funded
/// with the borrow token so `borrow()` can pay out.
contract MockLendingVenueWithViews is ILendingVenue, ILendingViews {
    address public immutable collUnderlying; // USDY (18 dec)
    address public immutable debtUnderlyingToken; // USDC (6 dec)

    uint256 internal _coll; // collateral in USDY units (18 dec)
    uint256 internal _debt; // debt in USDC units (6 dec)

    constructor(address collUnderlying_, address debtUnderlying_) {
        collUnderlying = collUnderlying_;
        debtUnderlyingToken = debtUnderlying_;
    }

    function supply(address asset, uint256 amount, address /* onBehalfOf */ ) external {
        require(asset == collUnderlying, "bad coll asset");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        _coll += amount;
    }

    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        require(asset == debtUnderlyingToken, "bad debt asset");
        _debt += amount;
        IERC20(asset).transfer(onBehalfOf, amount);
    }

    function repay(address asset, uint256 amount, address /* onBehalfOf */ ) external returns (uint256) {
        require(asset == debtUnderlyingToken, "bad debt asset");
        uint256 pay = amount > _debt ? _debt : amount;
        IERC20(asset).transferFrom(msg.sender, address(this), pay);
        _debt -= pay;
        return pay;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(asset == collUnderlying, "bad coll asset");
        uint256 out = amount > _coll ? _coll : amount;
        _coll -= out;
        IERC20(asset).transfer(to, out);
        return out;
    }

    // --- ILendingViews ---
    function collateralUnderlying() external view returns (uint256) {
        return _coll;
    }

    function debtUnderlying() external view returns (uint256) {
        return _debt;
    }
}

/// @notice Unit tests for the V2.1 INIT-aware `totalAssets()` using a fast mock
/// venue (no fork). Asset = USDY (18 dec), safe = USDC (6 dec), matching the
/// real demo decimals so the decimal normalisation is exercised.
contract SolventVaultV2_1Test is Test {
    SolventVaultV2_1 vault;
    SolventAttestation att;
    MockERC20 usdy; // asset, 18 dec
    MockERC20 usdc; // safe, 6 dec
    MockLendingVenueWithViews venue;

    address owner = address(0xA11CE);
    address agent = address(0xA9E7);
    address alice = address(0xA11A);
    uint256 constant AGENT_ID = 106;

    uint256 constant DEPOSIT = 1_000e18; // 1000 USDY

    function _policy(address bridgeVenue) internal view returns (Policy memory) {
        return Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: address(usdc),
            bridgeVenue: bridgeVenue,
            maxBridgeLTVBps: 5000, // 50%
            allowedActions: (uint32(1) << uint8(ActionType.BRIDGE_VIA_LENDING))
                | (uint32(1) << uint8(ActionType.UNWIND_BRIDGE))
        });
    }

    function _deploy(address bridgeVenue) internal {
        att = new SolventAttestation(address(0));
        vault = new SolventVaultV2_1(address(usdy), owner, agent, AGENT_ID, address(att), _policy(bridgeVenue));
    }

    function setUp() public {
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        venue = new MockLendingVenueWithViews(address(usdy), address(usdc));
        usdc.mint(address(venue), 1_000_000e6); // borrowable liquidity

        _deploy(address(venue));

        // Alice deposits 1000 USDY.
        usdy.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        usdy.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, alice);
        vm.stopPrank();
    }

    // ----------------------------------------------------------------------
    //                       no-venue case (original formula)
    // ----------------------------------------------------------------------

    /// @dev When bridgeVenue == 0, totalAssets() must equal the original V2
    /// formula (asset bal + safe bal at nominal 1:1), ignoring any venue.
    function test_totalAssets_noVenue_usesOriginalFormula() public {
        _deploy(address(0)); // fresh vault, no bridge venue
        usdy.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        usdy.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, alice);
        vm.stopPrank();

        assertEq(vault.totalAssets(), DEPOSIT, "asset only");

        // Hand the vault 250 USDC -> counts at nominal 1:1 in asset (18 dec) units.
        usdc.mint(address(vault), 250e6);
        assertEq(vault.totalAssets(), DEPOSIT + 250e18, "safe asset at 1:1, no venue term");
    }

    // ----------------------------------------------------------------------
    //                       bridge preserves total / share price
    // ----------------------------------------------------------------------

    function test_bridge_preservesTotalAssets_andSharePrice() public {
        uint256 t0 = vault.totalAssets();
        assertEq(t0, DEPOSIT, "sanity: t0 == deposit");

        uint256 sharePriceBefore = vault.convertToAssets(1e18);

        // Bridge: supply 600 USDY collateral, borrow 200 USDC (<= 50% LTV).
        uint256 collateral = 600e18;
        uint256 borrow = 200e6;
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(collateral, borrow),
            Regime.EARLY_DEPEG,
            keccak256("bridge"),
            bytes32(0),
            ""
        );

        // Composition check: vault now holds (1000-600) USDY + 200 USDC; venue
        // reports 600 USDY collateral + 200 USDC debt.
        assertEq(usdy.balanceOf(address(vault)), DEPOSIT - collateral, "asset bal -C");
        assertEq(usdc.balanceOf(address(vault)), borrow, "safe bal +B");
        assertEq(venue.collateralUnderlying(), collateral, "coll +C");
        assertEq(venue.debtUnderlying(), borrow, "debt +B");

        // totalAssets reconstructed: assetBal(-C) + safeInAsset(+B) + coll(+C) - debtInAsset(-B)
        //  = 400e18 + 200e18 + 600e18 - 200e18 = 1000e18 == t0
        uint256 t1 = vault.totalAssets();
        assertApproxEqAbs(t1, t0, 1, "bridge preserves totalAssets");

        // Share price unchanged across the bridge.
        uint256 sharePriceAfter = vault.convertToAssets(1e18);
        assertApproxEqAbs(sharePriceAfter, sharePriceBefore, 1, "share price unchanged after bridge");
    }

    function test_bridgeThenUnwind_preservesSharePriceThroughout() public {
        uint256 t0 = vault.totalAssets();
        uint256 sp0 = vault.convertToAssets(1e18);

        // --- bridge ---
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(uint256(600e18), uint256(200e6)),
            Regime.EARLY_DEPEG,
            keccak256("bridge"),
            bytes32(0),
            ""
        );
        assertApproxEqAbs(vault.totalAssets(), t0, 1, "total preserved after bridge");
        assertApproxEqAbs(vault.convertToAssets(1e18), sp0, 1, "sp preserved after bridge");

        // --- unwind: repay 200 USDC, withdraw 600 USDY ---
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.UNWIND_BRIDGE,
            abi.encode(uint256(200e6), uint256(600e18)),
            Regime.CALM,
            keccak256("unwind"),
            bytes32(0),
            ""
        );

        // Position cleared, all USDY back in the vault.
        assertEq(venue.collateralUnderlying(), 0, "coll cleared");
        assertEq(venue.debtUnderlying(), 0, "debt cleared");
        assertEq(usdy.balanceOf(address(vault)), t0, "all USDY back");
        assertEq(usdc.balanceOf(address(vault)), 0, "no residual USDC");

        assertApproxEqAbs(vault.totalAssets(), t0, 1, "total preserved after unwind");
        assertApproxEqAbs(vault.convertToAssets(1e18), sp0, 1, "sp preserved after unwind");
    }

    /// @dev A second depositor entering WHILE the vault is bridged must get
    /// fair shares (NAV-correct), which only holds if totalAssets values the
    /// position. This is the depositor-fairness consequence of the override.
    function test_depositWhileBridged_mintsFairShares() public {
        // Bridge first.
        vm.prank(agent);
        vault.executeProtectiveAction(
            ActionType.BRIDGE_VIA_LENDING,
            abi.encode(uint256(600e18), uint256(200e6)),
            Regime.EARLY_DEPEG,
            keccak256("bridge"),
            bytes32(0),
            ""
        );

        // Bob deposits 500 USDY while bridged. NAV per share is still 1:1, so he
        // should receive 500e18 shares (within rounding).
        address bob = address(0xB0B);
        usdy.mint(bob, 500e18);
        vm.startPrank(bob);
        usdy.approve(address(vault), 500e18);
        uint256 bobShares = vault.deposit(500e18, bob);
        vm.stopPrank();

        assertApproxEqAbs(bobShares, 500e18, 1e12, "fair shares while bridged");
        assertApproxEqAbs(vault.convertToAssets(bobShares), 500e18, 1e12, "bob's claim ~= 500 USDY");
    }
}
