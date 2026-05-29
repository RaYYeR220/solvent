"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, rwaOracleAbi } from "../contracts";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const ONE_E18 = BigInt("1000000000000000000");

export interface OraclePriceLive {
  priceWei: bigint;
  source: "oracle" | "constant";
  isLoading: boolean;
  isError: boolean;
}

export function useOraclePrice(): OraclePriceLive {
  const isUsdy = CONTRACTS.asset.toLowerCase() === USDY.toLowerCase();

  const oracle = useReadContract({
    address: CONTRACTS.oracle,
    abi: rwaOracleAbi,
    functionName: "getPrice",
    query: { enabled: isUsdy, refetchInterval: 12_000 },
  });

  if (!isUsdy) {
    return { priceWei: ONE_E18, source: "constant", isLoading: false, isError: false };
  }
  return {
    priceWei: (oracle.data as bigint | undefined) ?? ONE_E18,
    source: "oracle",
    isLoading: oracle.isLoading,
    isError: oracle.isError,
  };
}
