import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { NavSource } from "./types";
import { rwaOracleAbi } from "./abi/rwaOracleAbi";

/** Reads USDY NAV from Ondo's RWADynamicOracle. 1e18-scaled. */
export class OndoNavSource implements NavSource {
  constructor(private readonly client: PublicClient, private readonly oracle: Address) {}

  async getNavPrice(): Promise<bigint> {
    return this.client.readContract({
      address: this.oracle,
      abi: rwaOracleAbi,
      functionName: "getPrice",
    });
  }
}
