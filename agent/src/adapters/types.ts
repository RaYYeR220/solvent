/** Backing value of the asset (Ondo NAV / staking exchange rate), normalized to 1e18. */
export interface NavSource {
  getNavPrice(): Promise<bigint>;
}

/** Market price of the asset (e.g. DEX pool spot or an oracle), normalized to 1e18. */
export interface PriceSource {
  getMarketPrice(): Promise<bigint>;
}

/** Max asset amount sellable into the safe asset within acceptable slippage, asset-native units. */
export interface LiquiditySource {
  getLiquidityDepth(): Promise<bigint>;
}

/** The vault's current asset holding, asset-native units. */
export interface PositionSource {
  getAssetBalance(): Promise<bigint>;
}

/** An open bridge (lending) position, read off the vault's bridge venue views.
 *  `collateral` is in the risk asset's units; `debt` in the safe asset's units;
 *  `safeBalance` is the vault's safe-asset holding (used to size the unwind
 *  repay). Returns null when there is no bridge venue or no open position. */
export interface BridgeSource {
  getBridgedPosition(): Promise<{ collateral: bigint; debt: bigint; safeBalance: bigint } | null>;
}
