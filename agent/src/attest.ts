import { encodeAbiParameters, keccak256, stringToHex } from "viem";
import type { Signals } from "./types";

/** Deterministic hash of the signal snapshot, recorded on-chain as evidence for a decision. */
export function computeSignalsHash(s: Signals): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
    [s.navPrice, s.marketPrice, s.liquidityDepth, s.assetBalance, BigInt(s.timestamp)],
  );
  return keccak256(encoded);
}

/** Encodes a short reason string into a right-padded bytes32 (max 31 chars). */
export function encodeReasonCode(code: string): `0x${string}` {
  return stringToHex(code, { size: 32 });
}
