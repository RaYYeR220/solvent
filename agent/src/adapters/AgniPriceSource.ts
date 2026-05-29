import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { PriceSource } from "./types";
import { quoterV2Abi } from "./abi/quoterV2Abi";

/** Reads market price by simulating a 1-unit swap through Agni V3's QuoterV2.
 *  Output is normalised to 1e18: price = amountOut / 10^safeDec * 10^assetDec.
 *  We probe with `1 token` (10^assetDecimals), which keeps quoter gas <100k.
 *
 *  V3 quoters are `nonpayable` in source (they simulate state mutation), but
 *  callable via `eth_call`/`simulateContract` without a tx.
 *
 *  Revert handling: V3 quoter reverts when the pool is missing OR has zero
 *  liquidity. On Mantle this is the steady state for USDT0/USDC and similar
 *  thin pairs. Rather than crash the tick, we fall back to a "nominal price"
 *  of 10^18 (= no observable divergence): the agent stays in CALM regime and
 *  attests an observation each tick, ready to react instantly if real liquidity
 *  arrives. For deeper pools (USDY/USDT post-Ondo-allowlist, or fork-replay)
 *  the quoter succeeds and the real DEX signal kicks in. */
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
    let amountOut: bigint;
    try {
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
      amountOut = result[0] as bigint;
    } catch {
      // Quoter reverts on missing or zero-liquidity pool → return nominal
      // 1.0 price (= signals "no divergence"). The agent's depeg-guardian
      // logic still fires when the NAV oracle reports a divergence on its
      // own, so this is a conservative degradation, not a silent failure.
      return 10n ** 18n;
    }
    return amountOut * 10n ** BigInt(18 - this.safeDecimals);
  }
}
