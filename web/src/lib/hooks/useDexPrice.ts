"use client";

import { useSimulateContract, useReadContract } from "wagmi";
import { CONTRACTS, quoterV2Abi, erc20Abi } from "../contracts";

const ONE_E18 = BigInt("1000000000000000000");
const FEE_TIER = 100;
const SCALE_6_TO_18 = BigInt("1000000000000");

export interface DexPriceLive {
  priceWei: bigint;
  fellBack: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useDexPrice(): DexPriceLive {
  // Probe ONE WHOLE asset token, scaled by the asset's on-chain decimals.
  // A hardcoded 1e6 only means "1 token" for a 6-dec asset (USDT0); for an
  // 18-dec asset (USDY) it quotes 1e-12 token → ~0 out → MKT shows 0.000.
  // USDT0 decimals=6 → PROBE_AMOUNT=1e6 (prod-equivalent, unchanged).
  const assetDecimals = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const decimals = (assetDecimals.data as number | undefined) ?? 6;
  // ES2017 target → no `10n` BigInt literals; use the BigInt() constructor form.
  const PROBE_AMOUNT = BigInt(10) ** BigInt(decimals);

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
  // amountOut is in SAFE-asset decimals (USDC=6 on both prod and fork) → ×1e12
  // normalises a one-whole-token quote to 1e18-scaled "price per token".
  const [amountOut] = sim.data.result as readonly [bigint, bigint, number, bigint];
  return {
    priceWei: amountOut * SCALE_6_TO_18,
    fellBack: false,
    isLoading: sim.isLoading,
    isError: false,
  };
}
