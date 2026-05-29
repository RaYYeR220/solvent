/** A Pinner is `string -> Promise<string>` where the input is the canonical
 *  JSON payload and the output is the URI to put on-chain. */
export type Pinner = (jsonContent: string) => Promise<string>;

/** Inline `data:` URI — no external dependency, no cost, but bloats calldata
 *  by ~4/3 the payload size. Suitable for small payloads (<4KB) and fallback
 *  when Pinata is unavailable. */
export function createDataUriPinner(): Pinner {
  return async (json) => {
    const b64 = Buffer.from(json, "utf8").toString("base64");
    return `data:application/json;base64,${b64}`;
  };
}

type FetchLike = (url: string, init?: any) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<{ IpfsHash?: string }>;
}>;

/** Pin to Pinata; on any error (non-2xx, network) fall back to a data: URI so
 *  the tick still produces an on-chain attestation. */
export function createPinataPinner(jwt: string, fetchFn: FetchLike = globalThis.fetch as any): Pinner {
  const fallback = createDataUriPinner();
  return async (json) => {
    try {
      const form = new FormData();
      form.append("file", new Blob([json], { type: "application/json" }), "solvent-attestation.json");
      const res = await fetchFn("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      if (!res.ok) return await fallback(json);
      const j = await res.json();
      if (!j.IpfsHash) return await fallback(json);
      return `ipfs://${j.IpfsHash}`;
    } catch {
      return await fallback(json);
    }
  };
}
