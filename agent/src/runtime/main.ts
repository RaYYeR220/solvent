#!/usr/bin/env tsx
// Auto-load agent/.env for local smoke testing. No-op when the file is
// missing (e.g. in CI, where the GH Actions workflow injects env directly).
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createReadClient, createWriteClient } from "../adapters/viemClients";
import { OndoNavSource } from "../adapters/OndoNavSource";
import { ConstantNavSource } from "../adapters/ConstantNavSource";
import { AgniPriceSource } from "../adapters/AgniPriceSource";
import { AgniLiquiditySource } from "../adapters/AgniLiquiditySource";
import { VaultPositionSource } from "../adapters/VaultPositionSource";
import { createPinataPinner, createDataUriPinner } from "../attestation/ipfsPinner";
import { createViemSender } from "../executor/viemSender";
import { runTick } from "./runTick";
import type { Address } from "../types";

export interface CliArgs { mode: "once" | "forever" }

export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0) return { mode: "forever" };
  if (argv.length === 1) {
    if (argv[0] === "--once") return { mode: "once" };
    if (argv[0] === "--forever") return { mode: "forever" };
  }
  throw new Error(`unknown flag: ${argv.join(" ")}`);
}

const QUOTER: Address = (process.env.QUOTER_ADDRESS ?? "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb") as Address;
const ONDO_ORACLE: Address = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f";
const LIQUIDITY_PROBE_DEFAULT: readonly bigint[] = [];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(process.env);

  const readClient = createReadClient(cfg.rpcUrl);
  const writeClient = createWriteClient(cfg.rpcUrl, cfg.agentPrivateKey);

  const USDY: Address = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
  const nav = cfg.asset.toLowerCase() === USDY.toLowerCase()
    ? new OndoNavSource(readClient, ONDO_ORACLE)
    : new ConstantNavSource(10n ** 18n);

  // Agni V3 fee tier. USDT0/USDC pool on Mantle exists only at 100 (0.01%) —
  // verified via AgniFactory.getPool. Pool is initialised but currently has
  // zero liquidity, so AgniPriceSource falls back to nominal 1e18; if liquidity
  // appears later, the agent picks up the real DEX signal automatically.
  // (Note: AgniDexAdapter contract was deployed in Plan 5 with feeTier=500;
  // this read-side mismatch is benign because AgniLiquiditySource is stubbed
  // to 0 on live mainnet, so the on-chain swap path never fires.)
  const FEE_TIER = process.env.FEE_TIER ? parseInt(process.env.FEE_TIER, 10) : 100;

  const price = new AgniPriceSource(
    readClient, QUOTER, cfg.asset, cfg.safeAsset,
    FEE_TIER,
    cfg.policy.assetDecimals, cfg.policy.safeDecimals,
  );

  let probeSizes: readonly bigint[] = LIQUIDITY_PROBE_DEFAULT;
  if (process.env.LIQUIDITY_PROBE_SIZES) {
    try {
      probeSizes = process.env.LIQUIDITY_PROBE_SIZES.split(",").map((s) => BigInt(s.trim()));
    } catch (e) {
      throw new Error(`Invalid LIQUIDITY_PROBE_SIZES (expected comma-separated decimal bigints): ${process.env.LIQUIDITY_PROBE_SIZES}`);
    }
  }
  const liquidity = new AgniLiquiditySource(
    readClient, QUOTER, cfg.asset, cfg.safeAsset,
    FEE_TIER, cfg.policy.assetDecimals, cfg.policy.safeDecimals,
    cfg.policy.maxSlippageBps, probeSizes,
  );

  const position = new VaultPositionSource(readClient, cfg.asset, cfg.vaultAddress);

  const pinner = cfg.pinataJwt
    ? createPinataPinner(cfg.pinataJwt)
    : createDataUriPinner();

  const sender = createViemSender(writeClient, cfg.vaultAddress);

  const tickOnce = async (tickNumber: number): Promise<void> => {
    const res = await runTick({
      sources: { nav, price, liquidity, position },
      policy: cfg.policy,
      sender, pinner, tick: tickNumber,
      agentId: cfg.agentId,
      addresses: { vault: cfg.vaultAddress, asset: cfg.asset, safeAsset: cfg.safeAsset },
    });
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      tick: tickNumber,
      regime: res.decision.regime,
      action: res.decision.plan.action,
      reasonCode: res.decision.reasonCode,
      txHash: res.txHash,
      uri: res.uri,
    }));
  };

  if (args.mode === "once") {
    const tick = Math.floor(Date.now() / 1000 / 60);
    await tickOnce(tick);
    return;
  }

  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tickOnce(n++); }
    catch (e) { console.error(JSON.stringify({ ts: new Date().toISOString(), tick: n - 1, error: String(e) })); }
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), fatal: String(e) }));
    process.exit(1);
  });
}
