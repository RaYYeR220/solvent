export type Address = `0x${string}`;

/** Mirrors contracts/src/Policy.sol ActionType (NONE=0). */
export enum ActionType {
  NONE = 0,
  SWAP_TO_SAFE = 1,
  BRIDGE_VIA_LENDING = 2,
  UNWIND_BRIDGE = 3,
  PARK_YIELD = 4,
}

/** Mirrors contracts/src/Policy.sol Regime. */
export enum Regime {
  CALM = 0,
  WATCH = 1,
  EARLY_DEPEG = 2,
  TERMINAL_DEPEG = 3,
}

/** An open bridge (lending) position the vault holds, read off the bridge venue's
 *  position views. `collateral` is in the risk asset's units (e.g. USDY 18dec),
 *  `debt` in the safe asset's units (e.g. USDC 6dec) — i.e. the amounts
 *  `UNWIND_BRIDGE` must repay/withdraw to close it. `safeBalance` is the vault's
 *  own safe-asset holding (also safe-asset units): on unwind we repay the WHOLE
 *  safe balance when it covers the debt, so the borrow-interest dust accrued
 *  since the (stale) view read is always covered and the position closes fully
 *  (the venue refunds any unspent safe asset). */
export interface BridgedPosition {
  collateral: bigint; // collateral underlying, asset-native units
  debt: bigint; // debt underlying (stale view read), safe-asset-native units
  safeBalance: bigint; // vault's safe-asset balance, safe-asset-native units
}

/** A snapshot of the world at one tick. Prices normalized to 1e18; amounts in token-native units. */
export interface Signals {
  navPrice: bigint; // backing value (Ondo NAV / exchange rate), 1e18
  marketPrice: bigint; // DEX market price, 1e18
  liquidityDepth: bigint; // max asset sellable into safe within slippage, asset-native units
  assetBalance: bigint; // vault's current asset holding, asset-native units
  oracleDivergenceBps: number; // spread between independent price sources, bps
  timestamp: number; // unix seconds
  bridged?: BridgedPosition; // open bridge position (collateral+debt), if any
}

/** Agent-side risk config. Superset of the on-chain Policy (adds off-chain-only tuning). */
export interface AgentPolicy {
  watchDivergenceBps: number;
  earlyDivergenceBps: number;
  terminalDivergenceBps: number;
  maxOracleDivergenceBps: number; // above this, the price signal is untrusted
  liquidityFloor: bigint; // asset-native units
  maxSlippageBps: number; // mirrors on-chain
  maxBridgeLTVBps: number; // mirrors on-chain
  assetDecimals: number;
  safeDecimals: number;
  allowedActions: number; // bitmap: bit (1 << ActionType)
}

export type ActionPlan =
  | { action: ActionType.NONE }
  | { action: ActionType.SWAP_TO_SAFE; amountIn: bigint; amountOutMin: bigint }
  | { action: ActionType.BRIDGE_VIA_LENDING; collateralAmount: bigint; borrowAmount: bigint }
  | { action: ActionType.UNWIND_BRIDGE; repayAmount: bigint; withdrawAmount: bigint }
  | { action: ActionType.PARK_YIELD; amount: bigint };

export interface Decision {
  regime: Regime;
  plan: ActionPlan;
  reasonCode: string; // short code, e.g. "early-exit" (encoded to bytes32 at send time)
}

export function isActionAllowed(p: AgentPolicy, a: ActionType): boolean {
  if (a === ActionType.NONE) return false;
  return (p.allowedActions & (1 << a)) !== 0;
}

/** Downward divergence of market price below backing value (NAV), in bps of NAV. 0 if market >= nav. */
export function divergenceBps(s: Signals): number {
  if (s.navPrice <= 0n || s.marketPrice >= s.navPrice) return 0;
  return Number(((s.navPrice - s.marketPrice) * 10000n) / s.navPrice);
}
