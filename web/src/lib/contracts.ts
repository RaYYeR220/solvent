import type { Abi } from "viem";
import vaultAbiJson from "../../../contracts/exports/abis/SolventVaultV2.json" with { type: "json" };
import attestationAbiJson from "../../../contracts/exports/abis/SolventAttestation.json" with { type: "json" };

// NOTE: each env var MUST be referenced as a STATIC `process.env.NEXT_PUBLIC_*`
// literal. Next.js inlines `NEXT_PUBLIC_*` into the client bundle only when it
// sees the full property access at build time; a dynamic `process.env[key]`
// lookup is NOT replaced and resolves to `undefined` in the browser — which
// silently dropped the env config and fell back to the mainnet addresses
// (e.g. the fork demo vault never reached the client). Keep these literal.
function envOrFallback(value: string | undefined, name: string, fallback: string): string {
  if (value && value.length > 0) return value;
  if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
    // Production-only: surface a missing-env misconfig instead of silently
    // running on the hardcoded fallback. Tests + local dev keep the fallback
    // behavior so vitest doesn't need env wiring.
    console.error(`Solvent: ${name} missing in production — falling back to ${fallback}`);
  }
  return fallback;
}

export const CONTRACTS = {
  vault: envOrFallback(process.env.NEXT_PUBLIC_VAULT_ADDRESS, "NEXT_PUBLIC_VAULT_ADDRESS", "0xDDEd84Ef1ceA80af70b23B599cC9672a15c57c9f") as `0x${string}`,
  attestation: envOrFallback(process.env.NEXT_PUBLIC_ATTEST_ADDRESS, "NEXT_PUBLIC_ATTEST_ADDRESS", "0x89D3F83B777b245A80baec60277B449B8E72B5D3") as `0x${string}`,
  reputationRegistry: envOrFallback(process.env.NEXT_PUBLIC_REP_REGISTRY, "NEXT_PUBLIC_REP_REGISTRY", "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63") as `0x${string}`,
  asset: envOrFallback(process.env.NEXT_PUBLIC_ASSET_ADDRESS, "NEXT_PUBLIC_ASSET_ADDRESS", "0x779Ded0c9e1022225f8E0630b35a9b54bE713736") as `0x${string}`,
  safeAsset: envOrFallback(process.env.NEXT_PUBLIC_SAFE_ASSET_ADDRESS, "NEXT_PUBLIC_SAFE_ASSET_ADDRESS", "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9") as `0x${string}`,
  oracle: "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f" as `0x${string}`,
  quoter: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb" as `0x${string}`,
  agentId: BigInt(envOrFallback(process.env.NEXT_PUBLIC_AGENT_ID, "NEXT_PUBLIC_AGENT_ID", "106")),
};

export const vaultAbi = vaultAbiJson as Abi;
export const attestationAbi = attestationAbiJson as Abi;

// ERC-8004 ReputationRegistry — minimal subset (NewFeedback event).
// Verified 2026-05-29 against live-log topic
// 0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc
// → keccak256("NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)")
// (upstream canonical name; the spec calls it "FeedbackGiven" but the deployed
//  contract emits "NewFeedback" — sampled from 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63).
export const reputationRegistryAbi = [
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// Minimal ERC-20 ABI used by useDeposit and the asset balance read.
export const erc20Abi = [
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
] as const;

export const rwaOracleAbi = [
  { type: "function", name: "getPrice", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const quoterV2Abi = [
  { type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
    inputs: [{ type: "tuple", name: "params", components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ]}],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
