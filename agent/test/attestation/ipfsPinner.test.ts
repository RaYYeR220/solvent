import { describe, expect, it, vi } from "vitest";
import { createPinataPinner, createDataUriPinner } from "../../src/attestation/ipfsPinner";

describe("createDataUriPinner", () => {
  it("returns a base64-encoded data: URI", async () => {
    const pin = createDataUriPinner();
    const uri = await pin('{"hello":"world"}');
    expect(uri).toBe("data:application/json;base64,eyJoZWxsbyI6IndvcmxkIn0=");
  });

  it("round-trips ASCII content through base64", async () => {
    const pin = createDataUriPinner();
    const uri = await pin("solvent");
    expect(uri).toBe("data:application/json;base64,c29sdmVudA==");
  });
});

describe("createPinataPinner", () => {
  it("POSTs to pinFileToIPFS with the Authorization header and returns ipfs:// URI", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ IpfsHash: "QmTEST123" }),
    } as any);
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toBe("ipfs://QmTEST123");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer jwt-token" }),
      }),
    );
  });

  it("falls back to data: URI when Pinata returns non-200", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({}),
    } as any);
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toMatch(/^data:application\/json;base64,/);
  });

  it("falls back to data: URI when Pinata throws (network error)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toMatch(/^data:application\/json;base64,/);
  });

  it("falls back to data: URI when Pinata returns 200 OK but no IpfsHash in body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: "rate limited" }),
    } as any);
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toMatch(/^data:application\/json;base64,/);
  });
});
