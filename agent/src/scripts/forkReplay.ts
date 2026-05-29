#!/usr/bin/env tsx
/** Drives a scripted scenario against the live engine, recording per-tick
 *  state to a committed JSON file. Build-time script consumed by Plan 7's
 *  dashboard ForkReplay component.
 *
 *  Usage:
 *    tsx src/scripts/forkReplay.ts transient-depeg > replay-transient.json
 *    tsx src/scripts/forkReplay.ts terminal-collapse > replay-terminal.json
 *
 *  Implementation: scenarios are deterministic at the signals layer, so we
 *  feed runTick a mocked NavSource/PriceSource/LiquiditySource backed by
 *  the scenario steps. Vault/attestation writes are stubbed (no anvil); the
 *  replay JSON's `txHash` fields are deterministic placeholders. The dashboard
 *  treats them as "agent-on-fork would have submitted tx X here". */
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../adapters/mocks";
import { runTick } from "../runtime/runTick";
import { createDataUriPinner } from "../attestation/ipfsPinner";
import { scenarios, type Scenario } from "./scenarios";
import { ActionType, Regime, type AgentPolicy } from "../types";
import { fileURLToPath } from "node:url";

const POLICY: AgentPolicy = {
  watchDivergenceBps: 100,
  earlyDivergenceBps: 300,
  terminalDivergenceBps: 1000,
  maxOracleDivergenceBps: 200,
  liquidityFloor: 0n,
  maxSlippageBps: 300,
  maxBridgeLTVBps: 5000,
  assetDecimals: 6,
  safeDecimals: 6,
  allowedActions: 0b11110,
};

const VAULT = "0x06513470e16a7d6071A12708c38a6fa0ED66469c" as `0x${string}`;
const ASSET = "0x5bE26527e817998A7206475496fDE1E68957c5A6" as `0x${string}`; // USDY for demo narrative
const SAFE  = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9" as `0x${string}`;

export async function replay(scenario: Scenario): Promise<{ scenario: string; ticks: any[] }> {
  const nav = new MockNavSource(0n);
  const price = new MockPriceSource(0n);
  const liquidity = new MockLiquiditySource(0n);
  const position = new MockPositionSource(0n);
  const sender = {
    executeProtectiveAction: async (a: any) => {
      return ("0x" + ("e" + a.action.toString(16).padStart(2, "0")).padEnd(64, "0")) as `0x${string}`;
    },
    attestObservation: async (_a: any) => ("0x" + "a".repeat(64)) as `0x${string}`,
  };
  const pinner = createDataUriPinner();

  let vaultBalance = 1_000_000_000n;
  position.setValue(vaultBalance);

  const ticks: any[] = [];
  for (const step of scenario.steps) {
    nav.setValue(step.oracleNav);
    price.setValue(step.marketPrice);
    liquidity.setValue(step.liquidityDepth);

    const balanceBeforeAction = vaultBalance;

    const res = await runTick({
      sources: { nav, price, liquidity, position },
      policy: POLICY,
      sender,
      pinner,
      tick: step.tick,
      agentId: 106n,
      addresses: { vault: VAULT, asset: ASSET, safeAsset: SAFE },
    });

    // Apply naive outcome to vaultBalance so SUBSEQUENT ticks see post-action state.
    if (res.decision.plan.action === ActionType.SWAP_TO_SAFE) {
      vaultBalance = 0n;
    } else if (res.decision.plan.action === ActionType.BRIDGE_VIA_LENDING) {
      vaultBalance = 0n;
    }
    position.setValue(vaultBalance);

    ticks.push({
      tick: step.tick,
      timestamp: Date.now() + step.tick * 12_000,
      regime: Regime[res.decision.regime],
      action: ActionType[res.decision.plan.action],
      reasonCode: res.decision.reasonCode,
      signals: {
        navPrice: step.oracleNav.toString(),
        marketPrice: step.marketPrice.toString(),
        liquidityDepth: step.liquidityDepth.toString(),
        assetBalance: balanceBeforeAction.toString(),
      },
      postActionBalance: vaultBalance.toString(),
      txHash: res.txHash,
      uri: res.uri,
    });
  }
  return { scenario: scenario.name, ticks };
}

async function main() {
  const name = process.argv[2];
  const scenario = scenarios.find((s) => s.name === name);
  if (!scenario) {
    console.error(`unknown scenario: ${name}\navailable: ${scenarios.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
  const out = await replay(scenario);
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
