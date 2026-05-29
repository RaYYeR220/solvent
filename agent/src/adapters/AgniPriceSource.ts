import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { PriceSource } from "./types";
import { quoterV2Abi } from "./abi/quoterV2Abi";

/** Reads market price by simulating a 1-unit swap through Agni V3's QuoterV2.
 *  Output is normalised to 1e18: price = amountOut / 10^safeDec * 10^assetDec.
 *  We probe with `1 token` (10^assetDecimals), which keeps quoter gas <100k.
 *
 *  V3 quoters are `nonpayable` in source (they simulate state mutation), but
 *  callable via `eth_call`/`simulateContract` without a tx. */
export class AgniPriceSource implements PriceSource {
  constructor(
    private readonly client: PublicClient,
    private readonly quoter: Address,
    private readonly assetIn: Address,
    private readonly assetOut: Address,
    private readonly feeTier: number,
    private readonly assetDecimals: number,
    private readonly safeDecimals: number,
  ) {
    if (assetDecimals < 0 || assetDecimals > 18) {
      throw new Error(`AgniPriceSource: assetDecimals must be in [0, 18], got ${assetDecimals}`);
    }
    if (safeDecimals < 0 || safeDecimals > 18) {
      throw new Error(`AgniPriceSource: safeDecimals must be in [0, 18], got ${safeDecimals}`);
    }
  }

  async getMarketPrice(): Promise<bigint> {
    const amountIn = 10n ** BigInt(this.assetDecimals);
    const { result } = await this.client.simulateContract({
      address: this.quoter,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: this.assetIn,
        tokenOut: this.assetOut,
        amountIn,
        fee: this.feeTier,
        sqrtPriceLimitX96: 0n,
      }],
    });
    const amountOut = result[0] as bigint;
    return amountOut * 10n ** BigInt(18 - this.safeDecimals);
  }
}
