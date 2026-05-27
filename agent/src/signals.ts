import type { LiquiditySource, NavSource, PositionSource, PriceSource } from "./adapters/types";
import type { Signals } from "./types";

export interface SignalSources {
  nav: NavSource;
  price: PriceSource;
  priceCrossCheck?: PriceSource;
  liquidity: LiquiditySource;
  position: PositionSource;
}

/** Reads all sources (primary in parallel) and assembles a Signals snapshot. */
export async function gatherSignals(src: SignalSources): Promise<Signals> {
  const [navPrice, marketPrice, liquidityDepth, assetBalance] = await Promise.all([
    src.nav.getNavPrice(),
    src.price.getMarketPrice(),
    src.liquidity.getLiquidityDepth(),
    src.position.getAssetBalance(),
  ]);

  let oracleDivergenceBps = 0;
  if (src.priceCrossCheck) {
    const alt = await src.priceCrossCheck.getMarketPrice();
    const hi = marketPrice > alt ? marketPrice : alt;
    const lo = marketPrice > alt ? alt : marketPrice;
    oracleDivergenceBps = hi > 0n ? Number(((hi - lo) * 10000n) / hi) : 0;
  }

  return {
    navPrice,
    marketPrice,
    liquidityDepth,
    assetBalance,
    oracleDivergenceBps,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
