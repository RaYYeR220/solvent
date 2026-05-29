import type { NavSource } from "./types";

/** Static NAV (1e18 = $1) for permissionless demo assets (USDT0/USDC) where
 *  no on-chain NAV oracle exists. The depeg-guardian logic still applies:
 *  market price < NAV triggers EARLY/TERMINAL regimes. */
export class ConstantNavSource implements NavSource {
  constructor(private readonly value: bigint) {}
  async getNavPrice(): Promise<bigint> {
    return this.value;
  }
}
