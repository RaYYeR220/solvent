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
