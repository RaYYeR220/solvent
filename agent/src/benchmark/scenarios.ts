import { ActionType, type AgentPolicy } from "../types";
import type { Scenario } from "./types";

const ONE = 10n ** 18n;
/** milli = price * 1000, so price(985) = $0.985 as a 1e18 fixed-point value. */
const price = (milli: number): bigint => BigInt(milli) * 10n ** 15n;
const INITIAL = 1000n * ONE; // 1000 units of an 18-decimal asset
const THIN = 1n; // RWA reality: too little depth to exit -> forces the bridge
const DEEP = 10n ** 30n; // ample depth -> early exit is feasible

const ALL_ACTIONS =
  (1 << ActionType.SWAP_TO_SAFE) | (1 << ActionType.BRIDGE_VIA_LENDING) |
  (1 << ActionType.UNWIND_BRIDGE) | (1 << ActionType.PARK_YIELD);

/** Balanced preset the canonical scenarios are tuned against. */
export function benchmarkPolicy(): AgentPolicy {
  return {
    watchDivergenceBps: 25,
    earlyDivergenceBps: 50,
    terminalDivergenceBps: 1000,
    maxOracleDivergenceBps: 500,
    liquidityFloor: 0n,
    maxSlippageBps: 300,
    maxBridgeLTVBps: 5000,
    assetDecimals: 18,
    safeDecimals: 6,
    allowedActions: ALL_ACTIONS,
  };
}

/** USDC March-2023 shape: par -> ~$0.915 -> full recovery, on a thin pool. The bridge is the hero. */
export const transientScenario: Scenario = {
  name: "transient-depeg",
  description: "USDC March 2023 shape: dip to ~$0.915 then full recovery; thin liquidity forces the bridge.",
  assetDecimals: 18,
  safeDecimals: 6,
  initialAssetBalance: INITIAL,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(985), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 3600 },
    { navPrice: ONE, marketPrice: price(960), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 7200 },
    { navPrice: ONE, marketPrice: price(930), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 10800 },
    { navPrice: ONE, marketPrice: price(915), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 14400 },
    { navPrice: ONE, marketPrice: price(930), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 18000 },
    { navPrice: ONE, marketPrice: price(965), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 21600 },
    { navPrice: ONE, marketPrice: price(990), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 25200 },
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 28800 },
  ],
};

/** UST shape: progressive collapse to ~$0.10, no recovery; liquidity present early then dries. */
export const terminalScenario: Scenario = {
  name: "terminal-collapse",
  description: "UST shape: progressive collapse to ~$0.10, no recovery; liquidity present early then dries.",
  assetDecimals: 18,
  safeDecimals: 6,
  initialAssetBalance: INITIAL,
  ticks: [
    { navPrice: ONE, marketPrice: price(1000), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 0 },
    { navPrice: ONE, marketPrice: price(985), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 3600 },
    { navPrice: ONE, marketPrice: price(955), liquidityDepth: DEEP, oracleDivergenceBps: 0, timestamp: 7200 },
    { navPrice: ONE, marketPrice: price(900), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 10800 },
    { navPrice: ONE, marketPrice: price(780), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 14400 },
    { navPrice: ONE, marketPrice: price(560), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 18000 },
    { navPrice: ONE, marketPrice: price(340), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 21600 },
    { navPrice: ONE, marketPrice: price(180), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 25200 },
    { navPrice: ONE, marketPrice: price(100), liquidityDepth: THIN, oracleDivergenceBps: 0, timestamp: 28800 },
  ],
};
