import type { Address, AgentPolicy } from "./types";

export interface Config {
  rpcUrl: string;
  agentPrivateKey: `0x${string}`;
  vaultAddress: Address;
  asset: Address;
  safeAsset: Address;
  pollIntervalMs: number;
  policy: AgentPolicy;
}

type Env = Record<string, string | undefined>;

function req(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v === "") throw new Error(`Missing required config: ${key}`);
  return v;
}

function reqAddress(env: Env, key: string): Address {
  const v = req(env, key);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`Invalid address for ${key}: ${v}`);
  return v as Address;
}

function reqInt(env: Env, key: string): number {
  const v = req(env, key);
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
}

export function loadConfig(env: Env): Config {
  const pk = req(env, "AGENT_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Invalid AGENT_PRIVATE_KEY");

  const policy: AgentPolicy = {
    watchDivergenceBps: reqInt(env, "WATCH_DIVERGENCE_BPS"),
    earlyDivergenceBps: reqInt(env, "EARLY_DIVERGENCE_BPS"),
    terminalDivergenceBps: reqInt(env, "TERMINAL_DIVERGENCE_BPS"),
    maxOracleDivergenceBps: reqInt(env, "MAX_ORACLE_DIVERGENCE_BPS"),
    liquidityFloor: BigInt(req(env, "LIQUIDITY_FLOOR")),
    maxSlippageBps: reqInt(env, "MAX_SLIPPAGE_BPS"),
    maxBridgeLTVBps: reqInt(env, "MAX_BRIDGE_LTV_BPS"),
    assetDecimals: reqInt(env, "ASSET_DECIMALS"),
    safeDecimals: reqInt(env, "SAFE_DECIMALS"),
    allowedActions: reqInt(env, "ALLOWED_ACTIONS"),
  };

  return {
    rpcUrl: req(env, "MANTLE_RPC_URL"),
    agentPrivateKey: pk as `0x${string}`,
    vaultAddress: reqAddress(env, "VAULT_ADDRESS"),
    asset: reqAddress(env, "ASSET_ADDRESS"),
    safeAsset: reqAddress(env, "SAFE_ASSET_ADDRESS"),
    pollIntervalMs: reqInt(env, "POLL_INTERVAL_MS"),
    policy,
  };
}
