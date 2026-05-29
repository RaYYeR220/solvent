"use client";

import { useSimulateContract } from "wagmi";
import { CONTRACTS, quoterV2Abi } from "../contracts";

const ONE_E18 = BigInt("1000000000000000000");
const FEE_TIER = 100;
const PROBE_AMOUNT = BigInt(1_000_000);
const SCALE_6_TO_18 = BigInt("1000000000000");

export interface DexPriceLive {
  priceWei: bigint;
  fellBack: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useDexPrice(): DexPriceLive {
  const sim = useSimulateContract({
    address: CONTRACTS.quoter,
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [{
      tokenIn: CONTRACTS.asset,
      tokenOut: CONTRACTS.safeAsset,
      amountIn: PROBE_AMOUNT,
      fee: FEE_TIER,
      sqrtPriceLimitX96: BigInt(0),
    }],
    query: { refetchInterval: 12_000 },
  });

  if (sim.isError || !sim.data) {
    return {
      priceWei: ONE_E18,
      fellBack: true,
      isLoading: sim.isLoading,
      isError: false,
    };
  }
  const [amountOut] = sim.data.result as readonly [bigint, bigint, number, bigint];
  return {
    priceWei: amountOut * SCALE_6_TO_18,
    fellBack: false,
    isLoading: sim.isLoading,
    isError: false,
  };
}
