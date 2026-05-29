/** Convert any on-chain attestation URI into a browser-fetchable URL.
 *  - `ipfs://<cid>` → `<gateway>/ipfs/<cid>` (Pinata public gateway by default).
 *  - `data:...`     → returned unchanged (browsers fetch data URIs directly).
 *  - `http(s)://`   → returned unchanged. */
export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice("ipfs://".length);
    const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
    return `${gateway}/ipfs/${cid}`;
  }
  return uri;
}

/** Fetch the JSON payload behind any attestation URI. The dashboard wraps this
 *  in React Query (60s TTL) so repeat resolutions of the same URI cost nothing. */
export async function fetchAttestationJson(uri: string): Promise<unknown> {
  const url = resolveUri(uri);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchAttestationJson ${res.status}: ${url}`);
  return res.json();
}
