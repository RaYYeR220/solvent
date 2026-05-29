import { describe, expect, it } from "vitest";
import { resolveUri } from "../../src/lib/ipfs";

describe("resolveUri", () => {
  it("rewrites ipfs:// URIs to the Pinata gateway", () => {
    expect(resolveUri("ipfs://QmTEST")).toBe("https://gateway.pinata.cloud/ipfs/QmTEST");
  });

  it("decodes data:application/json;base64,... URIs to inline JSON", async () => {
    const json = '{"hello":"world"}';
    const dataUri = "data:application/json;base64," + Buffer.from(json, "utf8").toString("base64");
    expect(resolveUri(dataUri)).toBe(dataUri);
  });

  it("returns http(s) URIs unchanged", () => {
    expect(resolveUri("https://example.com/payload.json")).toBe("https://example.com/payload.json");
  });
});
