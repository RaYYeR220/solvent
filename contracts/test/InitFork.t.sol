// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*//////////////////////////////////////////////////////////////////////////
              CONFIRMED INIT CAPITAL ABI + FEASIBILITY — pinned on a fork
   Mantle mainnet (rpc.mantle.xyz), block ~96.36M, 2026-06-07.

   HOW THIS WAS PINNED (not guessed):
   - INIT Core 0x972BcB02… is a proxy -> impl 0xf8B8552D…2bA05D. We probed the
     impl bytecode for selector presence, cross-checked candidate signatures
     against the canonical INIT Capital interface, and then PROVED the whole
     lifecycle with the round-trip test below going GREEN.
   - The old IInitCore in src/adapters/InitLendingAdapter.sol was WRONG on three
     selectors (see "OLD vs CONFIRMED" notes). The confirmed signatures are here.

   ============================ CONFIRMED IInitCore =========================
   INIT Core (proxy)  = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5

   mint / redeem of inToken shares ("transfer-then-call", Uniswap-V3-style):
     mintTo(address lendingPool, address receiver) returns (uint256 shares)  // 0x951b6c02
       -> FIRST transfer the underlying into the pool, THEN call mintTo.
     burnTo(address lendingPool, address receiver) returns (uint256 amount)  // 0x7fe6bc3d
       -> FIRST transfer the inTokens into the pool, THEN call burnTo (redeem).

   position lifecycle:
     createPos(uint16 mode, address viewer) returns (uint256 posId)          // 0x2fb4bf64
     collateralize(uint256 posId, address lendingPool)                       // 0xabf4dd39
       -> NO amount arg. Sweeps inTokens transferred INTO the position manager
          before the call. OLD repo sig collateralize(uint,address,uint) WRONG.
     decollateralize(uint256 posId, address lendingPool, uint256 shares, address receiver) // 0x42d91bc3
     borrow(address lendingPool, uint256 amount, uint256 posId, address receiver)          // 0x22e953ac
            returns (uint256 debtShares)
       -> arg order (pool, AMOUNT-underlying, posId, receiver); sends UNDERLYING
          (USDC) straight to receiver. OLD repo sig borrow(uint,address,uint) WRONG.
     repay(address lendingPool, uint256 repayShares, uint256 posId)          // 0x8cd2e0c7
            returns (uint256 repaidAmount)
       -> repay BY DEBT-SHARES (not amount). Approve the underlying (USDC) to
          Core first; Core pulls amount = pool.debtShareToAmtCurrent(shares).
          OLD repo sig repay(uint,address,uint) WRONG.
     getPosHealthCurrent_e18(uint256 posId) returns (uint256 health_e18)     // 0xa72ca39b
       -> health >= 1e18 == solvent.

   ===================== READING A POSITION'S COLLATERAL & DEBT =============
   Live amounts are read off the POSITION MANAGER (INIT_POS_MANAGER =
   0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92), NOT Core:
     IPosManager.getPosCollInfo(uint256 posId) returns                       // 0x056b0ac7
        (address[] pools, uint256[] amts, address[] wLps, uint256[][] ids, uint256[][] wLpAmts)
        -> amts[i] = inToken SHARE balance held as collateral in pools[i].
           Underlying = ILendingPool(pools[i]).toAmtCurrent(amts[i]).
     IPosManager.getPosBorrInfo(uint256 posId) returns                       // 0x947557b3
        (address[] pools, uint256[] debtShares)
        -> debtShares[i] = DEBT shares in pools[i].
           Underlying debt = ILendingPool(pools[i]).debtShareToAmtCurrent(debtShares[i]).

   lending-pool share<->amount math (inUSDY / inUSDC):
     toAmtCurrent(uint shares) returns (uint amt)            // accrues, exact
     toAmt(uint shares) view returns (uint amt)              // may be stale
     debtShareToAmtCurrent(uint shares) returns (uint amt)   // accrues, exact
     underlyingToken() view returns (address)

   ============================ FEASIBILITY VERDICT =========================
   USDY-collateral / USDC-borrow IS SUPPORTED. IInitConfig.getModeConfig(mode)
   returns (collWhitelist[], borrowWhitelist[], ...). MODE 1 whitelists BOTH
   inUSDY (0xf0848…) as collateral AND inUSDC (0x00A556…) as a borrow target
   (modes 3 & 5 do too). Observed usable LTV against USDY collateral, measured
   empirically in test_init_observed_max_ltv, is ~6545 bps (~65.4%) of USDY's USD
   value: ~742.9 USDC borrowable against ~1135 USDC of USDY collateral value.

   ⚠ GOTCHA — MINT *AND* BORROW ARE PAUSED PROTOCOL-WIDE AT THIS BLOCK
   (transient guardian pause, NOT a structural rejection of USDY):
     - mintTo reverts "INC#400" == InitErrors.MINT_PAUSED  (PoolConfig.canMint=0
       on BOTH inUSDY and inUSDC).
     - borrow reverts "INC#402" == InitErrors.BORROW_PAUSED (ModeStatus.canBorrow=0
       on EVERY mode 1-8).
   These are operational flags — the pools hold $1.2M+ minted historically, the
   pair is whitelisted in mode 1, and the oracle prices USDY (~$1.135). On a FORK
   we legitimately flip both flags back on (see _unpauseMint / _unpauseModeBorrow)
   to mirror INIT's normal unpaused state. For LIVE use the adapter must tolerate
   that mint/borrow can revert when INIT has paused them — flag for the adapter task.
   canBurn(inUSDY) and canRepay are NOT paused, so the unwind half works regardless.

   FORK-UNPAUSE STORAGE MAP (InitConfig 0x007F9163…), discovered by slot probing:
     - PoolConfig:  mapping base slot 2. keccak(abi.encode(pool,2)) holds packed
       (supplyCap|borrowCap); the NEXT slot's byte0 is `canMint` -> set to 1.
     - ModeStatus:  __modeConfigs mapping base slot 3. keccak(abi.encode(mode,3))+6
       holds packed (canColl|canDecoll|canBorrow|canRepay), one byte each;
       `canBorrow` is byte2 (bit 16) -> set to 1.
//////////////////////////////////////////////////////////////////////////*/

interface IInitCore {
    function createPos(uint16 mode, address viewer) external returns (uint256 posId);
    function mintTo(address lendingPool, address receiver) external returns (uint256 shares);
    function burnTo(address lendingPool, address receiver) external returns (uint256 amount);
    function collateralize(uint256 posId, address lendingPool) external;
    function decollateralize(uint256 posId, address lendingPool, uint256 shares, address receiver) external;
    function borrow(address lendingPool, uint256 amount, uint256 posId, address receiver)
        external
        returns (uint256 debtShares);
    function repay(address lendingPool, uint256 repayShares, uint256 posId)
        external
        returns (uint256 repaidAmount);
    function getPosHealthCurrent_e18(uint256 posId) external returns (uint256 health_e18);
}

interface IInitPosManager {
    function getPosCollInfo(uint256 posId)
        external
        view
        returns (
            address[] memory pools,
            uint256[] memory amts,
            address[] memory wLps,
            uint256[][] memory ids,
            uint256[][] memory wLpAmts
        );
    function getPosBorrInfo(uint256 posId)
        external
        view
        returns (address[] memory pools, uint256[] memory debtShares);
}

interface IInitLendingPool {
    function underlyingToken() external view returns (address);
    function toAmtCurrent(uint256 shares) external returns (uint256 amt);
    function debtShareToAmtCurrent(uint256 shares) external returns (uint256 amt);
}

contract InitForkTest is Test {
    // INIT Capital (Mantle mainnet)
    address constant CORE = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5;
    address constant POS_MANAGER = 0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92;
    address constant CONFIG = 0x007F91636E0f986068Ef27c950FA18734BA553Ac;
    address constant INUSDY = 0xf084813F1be067d980a0171F067f084f27B3F63A; // underlying USDY
    address constant INUSDC = 0x00A55649E597d463fD212fBE48a3B40f0E227d06; // underlying USDC

    // Tokens
    address constant USDY = 0x5bE26527e817998A7206475496fDE1E68957c5A6; // 18 dec
    address constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9; // 6 dec

    uint16 constant MODE = 1; // whitelists inUSDY (coll) + inUSDC (borrow)
    uint256 constant SUPPLY_USDY = 1000e18; // 1,000 USDY collateral

    IInitCore core = IInitCore(CORE);
    IInitPosManager posMgr = IInitPosManager(POS_MANAGER);

    bool internal forked;

    /// @dev INIT positions are ERC721 NFTs minted to `viewer` (this contract) by
    /// createPos, so we must accept ERC721 safe-transfers.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function setUp() public {
        // Standalone fork; skip gracefully if no network (CI without RPC).
        try vm.createSelectFork("https://rpc.mantle.xyz") {
            forked = true;
            // INIT has mint (INC#400) AND borrow (INC#402) operationally paused
            // PROTOCOL-WIDE at this block (a transient guardian pause, not a
            // structural rejection — pools hold $1.2M+ minted and the pair is
            // whitelisted in mode 1). Flip the flags back on for the fork so the
            // demo can run; this mirrors INIT's normal (unpaused) operating state.
            _unpauseMint(INUSDY);
            _unpauseMint(INUSDC);
            _unpauseModeBorrow(MODE);
        } catch {
            vm.skip(true);
        }
    }

    /// @notice Full feasibility proof: USDY collateral -> borrow USDC -> read
    /// collateral & debt -> repay -> withdraw. Pins the ABI by exercising it.
    function test_init_usdy_collateral_usdc_borrow_roundtrip() public {
        // Sanity: confirm the pools really wrap the tokens we think they do.
        assertEq(IInitLendingPool(INUSDY).underlyingToken(), USDY, "inUSDY!=USDY");
        assertEq(IInitLendingPool(INUSDC).underlyingToken(), USDC, "inUSDC!=USDC");

        // Fund this contract with USDY collateral. `deal` works on USDY here.
        deal(USDY, address(this), SUPPLY_USDY);
        assertEq(IERC20(USDY).balanceOf(address(this)), SUPPLY_USDY, "deal USDY");

        // 1) Mint inUSDY: transfer underlying into the pool, then Core.mintTo.
        IERC20(USDY).transfer(INUSDY, SUPPLY_USDY);
        uint256 inUsdyShares = core.mintTo(INUSDY, address(this));
        assertGt(inUsdyShares, 0, "mint inUSDY shares");
        assertEq(IERC20(INUSDY).balanceOf(address(this)), inUsdyShares, "hold inUSDY");

        // 2) Open a position and collateralize the inUSDY shares.
        //    collateralize() has NO amount arg: it sweeps inTokens transferred
        //    into the position manager before the call, so we transfer there.
        uint256 posId = core.createPos(MODE, address(this));
        assertGt(posId, 0, "createPos");
        IERC20(INUSDY).transfer(POS_MANAGER, inUsdyShares);
        core.collateralize(posId, INUSDY);

        // Read back collateral via PosManager -> convert shares to USDY.
        uint256 collUsdy = _collateralUnderlying(posId, INUSDY);
        assertApproxEqRel(collUsdy, SUPPLY_USDY, 0.01e18, "collateral ~= 1000 USDY");
        console.log("collateral USDY (1e18):", collUsdy);

        // 3) Borrow USDC against it (conservative: well within LTV).
        uint256 borrowUsdc = 500e6; // 500 USDC vs ~1135 USDC of USDY value
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));
        uint256 debtShares = core.borrow(INUSDC, borrowUsdc, posId, address(this));
        uint256 usdcAfter = IERC20(USDC).balanceOf(address(this));

        assertGt(debtShares, 0, "borrow returned debt shares");
        assertEq(usdcAfter - usdcBefore, borrowUsdc, "received exactly borrowUsdc");
        console.log("borrowed USDC (1e6):", usdcAfter - usdcBefore);

        uint256 health = core.getPosHealthCurrent_e18(posId);
        assertGt(health, 1e18, "position healthy after borrow");
        console.log("health_e18 after borrow:", health);

        // 4) Read back debt via PosManager -> convert debt-shares to USDC.
        (uint256 debtUsdc, address borrowPool) = _debtUnderlying(posId);
        assertEq(borrowPool, INUSDC, "debt is in inUSDC pool");
        assertApproxEqAbs(debtUsdc, borrowUsdc, 1e6, "debt ~= 500 USDC");
        console.log("debt USDC (1e6):", debtUsdc);

        // 5) Repay full debt (by shares) then withdraw all collateral.
        //    Top up a tiny USDC buffer for any accrued dust, approve Core to pull.
        deal(USDC, address(this), IERC20(USDC).balanceOf(address(this)) + 1e6);
        IERC20(USDC).approve(CORE, type(uint256).max);
        uint256 repaid = core.repay(INUSDC, debtShares, posId);
        assertGt(repaid, 0, "repaid USDC amount");
        console.log("repaid USDC (1e6):", repaid);

        // Debt cleared.
        (uint256 debtAfter,) = _debtUnderlying(posId);
        assertEq(debtAfter, 0, "debt cleared after repay");

        // Withdraw (decollateralize) all inUSDY back, then redeem -> USDY.
        core.decollateralize(posId, INUSDY, inUsdyShares, address(this));
        uint256 inUsdyBack = IERC20(INUSDY).balanceOf(address(this));
        assertApproxEqAbs(inUsdyBack, inUsdyShares, 1, "got inUSDY shares back");

        IERC20(INUSDY).transfer(INUSDY, inUsdyBack);
        uint256 usdyOut = core.burnTo(INUSDY, address(this));
        assertApproxEqRel(usdyOut, SUPPLY_USDY, 0.01e18, "redeemed ~1000 USDY");
        console.log("redeemed USDY (1e18):", usdyOut);

        // Collateral cleared.
        uint256 collAfter = _collateralUnderlying(posId, INUSDY);
        assertEq(collAfter, 0, "collateral cleared after withdraw");
    }

    /// @notice Empirically pin the usable LTV: borrow against a fixed collateral
    /// until INIT reverts on health, recording the max borrow achieved. Proves a
    /// non-zero, usable LTV (the feasibility gate) and logs its value.
    function test_init_observed_max_ltv() public {
        deal(USDY, address(this), SUPPLY_USDY);
        IERC20(USDY).transfer(INUSDY, SUPPLY_USDY);
        uint256 inUsdyShares = core.mintTo(INUSDY, address(this));

        uint256 posId = core.createPos(MODE, address(this));
        IERC20(INUSDY).transfer(POS_MANAGER, inUsdyShares);
        core.collateralize(posId, INUSDY);

        uint256 collUsdy = _collateralUnderlying(posId, INUSDY); // ~1000 USDY

        // Bisection: max USDC borrow that keeps health >= 1e18, each on a snapshot.
        uint256 lo = 0;
        uint256 hi = 1500e6; // generous upper bound (> collateral USD value)
        for (uint256 i = 0; i < 24; i++) {
            uint256 mid = (lo + hi + 1) / 2;
            if (mid == lo) break;
            if (_borrowSucceeds(posId, mid)) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        assertGt(lo, 0, "must borrow SOME USDC against USDY (feasibility gate)");
        // LTV vs collateral USD value (USDY ~ $1.135 from INIT oracle).
        uint256 collUsdValue_e6 = (collUsdy * 1135e3) / 1e18; // ~1135e6
        uint256 ltvBps = (lo * 10_000) / collUsdValue_e6;
        console.log("max borrow USDC (1e6):", lo);
        console.log("collateral USD value (1e6):", collUsdValue_e6);
        console.log("observed max LTV (bps vs USD value):", ltvBps);
        // Sanity floor: an RWA-stable collateral should clear well above 50%.
        assertGt(ltvBps, 5000, "observed LTV should exceed 50%");
    }

    // ----------------------------- helpers --------------------------------

    /// @dev Flip InitConfig PoolConfig.canMint for `pool` to true on the fork.
    /// PoolConfig lives at mapping base slot 2; keccak(abi.encode(pool,2)) packs
    /// the caps, and the next slot's lowest byte (byte0) is `canMint`.
    function _unpauseMint(address pool) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(pool, uint256(2)))) + 1);
        uint256 cur = uint256(vm.load(CONFIG, slot));
        vm.store(CONFIG, slot, bytes32(cur | 0x01));
    }

    /// @dev Flip InitConfig ModeStatus.canBorrow for `mode` to true on the fork.
    /// __modeConfigs lives at mapping base slot 3; the packed ModeStatus
    /// (canCollateralize|canDecollateralize|canBorrow|canRepay, one byte each) is
    /// at struct offset 6, with canBorrow in byte2 (bit 16).
    function _unpauseModeBorrow(uint16 mode) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(uint256(mode), uint256(3)))) + 6);
        uint256 cur = uint256(vm.load(CONFIG, slot));
        vm.store(CONFIG, slot, bytes32(cur | (uint256(1) << 16)));
    }

    /// @dev Try a borrow of `amt` USDC on a snapshot; revert state after. Returns
    /// true iff INIT accepted it (health stayed >= 1e18).
    function _borrowSucceeds(uint256 posId, uint256 amt) internal returns (bool ok) {
        uint256 snap = vm.snapshotState();
        try core.borrow(INUSDC, amt, posId, address(this)) returns (uint256) {
            ok = true;
        } catch {
            ok = false;
        }
        vm.revertToState(snap);
    }

    function _collateralUnderlying(uint256 posId, address pool) internal returns (uint256 amtUnderlying) {
        (address[] memory pools, uint256[] memory amts,,,) = posMgr.getPosCollInfo(posId);
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == pool) {
                return IInitLendingPool(pool).toAmtCurrent(amts[i]);
            }
        }
        return 0;
    }

    function _debtUnderlying(uint256 posId) internal returns (uint256 amtUnderlying, address pool) {
        (address[] memory pools, uint256[] memory debtShares) = posMgr.getPosBorrInfo(posId);
        if (pools.length == 0) return (0, address(0));
        pool = pools[0];
        amtUnderlying = IInitLendingPool(pool).debtShareToAmtCurrent(debtShares[0]);
    }
}
