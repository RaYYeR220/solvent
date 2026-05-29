import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { PositionSource } from "./types";
import { erc20Abi } from "./abi/erc20Abi";

/** Vault's holding of the risk asset, asset-native units. */
export class VaultPositionSource implements PositionSource {
  constructor(
    private readonly client: PublicClient,
    private readonly asset: Address,
    private readonly vault: Address,
  ) {}

  async getAssetBalance(): Promise<bigint> {
    return this.client.readContract({
      address: this.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [this.vault],
    });
  }
}
