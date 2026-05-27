import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";
import { ActionType } from "../src/types";

const env = {
  MANTLE_RPC_URL: "https://rpc.mantle.xyz",
  AGENT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  VAULT_ADDRESS: "0x1111111111111111111111111111111111111111",
  ASSET_ADDRESS: "0x2222222222222222222222222222222222222222",
  SAFE_ASSET_ADDRESS: "0x3333333333333333333333333333333333333333",
  POLL_INTERVAL_MS: "15000",
  WATCH_DIVERGENCE_BPS: "25",
  EARLY_DIVERGENCE_BPS: "50",
  TERMINAL_DIVERGENCE_BPS: "500",
  MAX_ORACLE_DIVERGENCE_BPS: "200",
  LIQUIDITY_FLOOR: "0",
  MAX_SLIPPAGE_BPS: "300",
  MAX_BRIDGE_LTV_BPS: "5000",
  ASSET_DECIMALS: "18",
  SAFE_DECIMALS: "6",
  ALLOWED_ACTIONS: "30",
};

describe("loadConfig", () => {
  it("parses a complete env into a typed Config", () => {
    const c = loadConfig(env);
    expect(c.rpcUrl).toBe("https://rpc.mantle.xyz");
    expect(c.vaultAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(c.pollIntervalMs).toBe(15000);
    expect(c.policy.earlyDivergenceBps).toBe(50);
    expect(c.policy.liquidityFloor).toBe(0n);
    expect(c.policy.allowedActions).toBe(30);
    expect((c.policy.allowedActions & (1 << ActionType.SWAP_TO_SAFE)) !== 0).toBe(true);
  });

  it("throws a clear error when a required field is missing", () => {
    const { VAULT_ADDRESS, ...incomplete } = env;
    expect(() => loadConfig(incomplete)).toThrowError(/VAULT_ADDRESS/);
  });

  it("throws on a malformed address", () => {
    expect(() => loadConfig({ ...env, VAULT_ADDRESS: "nope" })).toThrowError(/VAULT_ADDRESS/);
  });
});
