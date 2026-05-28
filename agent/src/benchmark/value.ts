import type { Portfolio, ScenarioTick } from "./types";

/** Value of an asset amount expressed in safe-asset native units at a given 1e18 price. */
export function assetToSafe(assetAmount: bigint, price: bigint, assetDecimals: number, safeDecimals: number): bigint {
  return (assetAmount * price * 10n ** BigInt(safeDecimals)) / (10n ** 18n * 10n ** BigInt(assetDecimals));
}

/** Total portfolio value in safe-asset units, marked at the tick's market price. */
export function markToMarket(p: Portfolio, tick: ScenarioTick, assetDecimals: number, safeDecimals: number): bigint {
  const free = assetToSafe(p.assetBalance, tick.marketPrice, assetDecimals, safeDecimals);
  const bridgeEquity = p.bridged
    ? assetToSafe(p.bridged.collateral, tick.marketPrice, assetDecimals, safeDecimals) - p.bridged.debt
    : 0n;
  return p.safeBalance + free + bridgeEquity;
}
