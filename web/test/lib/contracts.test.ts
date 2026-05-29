import { describe, expect, it } from "vitest";
import { CONTRACTS, vaultAbi, attestationAbi, reputationRegistryAbi } from "../../src/lib/contracts";

describe("CONTRACTS", () => {
  it("exposes Mantle-deployed addresses", () => {
    expect(CONTRACTS.vault).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(CONTRACTS.attestation).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(CONTRACTS.reputationRegistry).toBe("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63");
    expect(CONTRACTS.agentId).toBe(BigInt(106));
  });

  it("vault and attestation ABIs include the expected functions", () => {
    const vaultFnNames = (vaultAbi as any[]).filter(e => e.type === "function").map(e => e.name);
    expect(vaultFnNames).toContain("agent");
    expect(vaultFnNames).toContain("policy");
    expect(vaultFnNames).toContain("deposit");

    const attestFnNames = (attestationAbi as any[]).filter(e => e.type === "function").map(e => e.name);
    expect(attestFnNames).toContain("record");

    const repEvents = (reputationRegistryAbi as unknown as any[]).filter(e => e.type === "event").map(e => e.name);
    expect(repEvents).toContain("NewFeedback");
  });
});
