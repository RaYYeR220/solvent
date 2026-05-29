import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { LiquiditySource } from "./types";
import { quoterV2Abi } from "./abi/quoterV2Abi";

/** Estimates swap depth by probing the Agni pool at a series of fixed sizes
 *  (ascending). Returns the LARGEST probe whose effective output stays within
 *  `maxSlippageBps` of a 1:1 nominal peg. If even the smallest probe fails,
 *  returns 0 (signals "don't swap" to selectAction).
 *
 *  Live-mainnet config: pass `probeSizes = []` to stub the source to 0 (forces
 *  the agent to BRIDGE-or-do-nothing — see spec §4: thin DEX liquidity on Mantle).
 *  Fork-replay config: pass concrete sizes (e.g. [1e6, 1e9, 1e12]) to enable
 *  the SWAP path on the deepened fork pool.
 *
 *  Quoter reverts on insufficient pool liquidity; we treat that as "probe failed". */
export class AgniLiquiditySource implements LiquiditySource {
  constructor(
    private readonly client: PublicClient,
    private readonly quoter: Address,
    private readonly assetIn: Address,
    private readonly assetOut: Address,
    private readonly feeTier: number,
    private readonly assetDecimals: number,
    private readonly safeDecimals: number,
    private readonly maxSlippageBps: number,
    private readonly probeSizes: readonly bigint[],
  ) {
    if (assetDecimals < 0 || assetDecimals > 18) {
      throw new Error(`AgniLiquiditySource: assetDecimals must be in [0, 18], got ${assetDecimals}`);
    }
    if (safeDecimals < 0 || safeDecimals > 18) {
      throw new Error(`AgniLiquiditySource: safeDecimals must be in [0, 18], got ${safeDecimals}`);
    }
  }

  async getLiquidityDepth(): Promise<bigint> {
    if (this.probeSizes.length === 0) return 0n;

    let largestPassing = 0n;
    const sorted = [...this.probeSizes].sort((a, b) => (a < b ? -1 : 1));
    for (const amountIn of sorted) {
      const passed = await this.probeOne(amountIn);
      if (passed) largestPassing = amountIn;
      else break;
    }
    return largestPassing;
  }

  private async probeOne(amountIn: bigint): Promise<boolean> {
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
      return false;
    }

    const inputNorm = amountIn * 10n ** BigInt(18 - this.assetDecimals);
    const outputNorm = amountOut * 10n ** BigInt(18 - this.safeDecimals);
    if (outputNorm === 0n) return false;
    const slippageBps = inputNorm > outputNorm
      ? Number(((inputNorm - outputNorm) * 10_000n) / inputNorm)
      : 0;
    return slippageBps <= this.maxSlippageBps;
  }
}
