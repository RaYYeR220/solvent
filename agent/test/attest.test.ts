import { describe, it, expect } from "vitest";
import { computeSignalsHash, encodeReasonCode } from "../src/attest";
import { hexToString } from "viem";
import type { Signals } from "../src/types";

const ONE = 10n ** 18n;
const base: Signals = { navPrice: ONE, marketPrice: ONE, liquidityDepth: 0n, assetBalance: 0n, oracleDivergenceBps: 0, timestamp: 1700000000 };

describe("computeSignalsHash", () => {
  it("returns a 32-byte hex hash", () => {
    const h = computeSignalsHash(base);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("is deterministic for identical signals", () => {
    expect(computeSignalsHash(base)).toBe(computeSignalsHash({ ...base }));
  });
  it("changes when any signal changes", () => {
    expect(computeSignalsHash(base)).not.toBe(computeSignalsHash({ ...base, marketPrice: ONE - 1n }));
  });
  it("changes when oracleDivergenceBps changes", () => {
    expect(computeSignalsHash(base)).not.toBe(computeSignalsHash({ ...base, oracleDivergenceBps: 150 }));
  });
});

describe("encodeReasonCode", () => {
  it("encodes a short code into a right-padded bytes32 readable back", () => {
    const enc = encodeReasonCode("early-exit");
    expect(enc).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hexToString(enc, { size: 32 })).toBe("early-exit");
  });
});
