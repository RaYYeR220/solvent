"use client";

import { useAccount } from "wagmi";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useOraclePrice } from "../lib/hooks/useOraclePrice";
import { useDexPrice } from "../lib/hooks/useDexPrice";
import { useDecisionLog } from "../lib/hooks/useDecisionLog";

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtAssetUnits(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same /1e18 parse as ChartPanel — attestation signal prices are 1e18-scaled
// strings. NaN-guarded so a missing/garbage value falls back gracefully.
function priceFromWei(s: string | undefined): number {
  if (!s) return NaN;
  try {
    return Number(BigInt(s)) / 1e18;
  } catch {
    return NaN;
  }
}

// Maps the agent's on-chain regime enum/string to a short display label.
function shortRegime(regime: string | undefined): string {
  if (!regime) return "—";
  const r = regime.toUpperCase();
  if (r.includes("TERMINAL")) return "TERMINAL";
  if (r.includes("EARLY")) return "EARLY";
  if (r.includes("CALM")) return "CALM";
  return r;
}

export default function ProtectedPositionStrip() {
  const vault = useVaultState();
  const oracle = useOraclePrice();
  const dex = useDexPrice();
  const log = useDecisionLog();
  const { isConnected } = useAccount();

  // Decimals come from chain (USDT0=6, USDY=18, …) — never hardcoded. While the
  // reads are in-flight we render `…` instead of a number so we never flash a
  // wrong-magnitude value (e.g. an 18-dec asset divided as if it were 6-dec).
  const decimalsReady = !vault.decimalsLoading;
  const tvlUsd = Number(vault.totalAssets) / 10 ** vault.assetDecimals;
  const userShareDisplay = Number(vault.userShares) / 10 ** vault.shareDecimals;
  // Nominal $1 per share at 1:1; entry baseline = current value (no historical tracking in V2 yet).
  const userValueUsd = userShareDisplay;
  const entryUsd = userValueUsd;
  const deltaPct = 0;

  // Vault composition (risk + safe balances) — shown when no wallet is
  // connected so the demo communicates protection (USDY→USDC) rather than a
  // misleading "0.00" user stake.
  const riskUnits = Number(vault.riskAssetBalance) / 10 ** vault.assetDecimals;
  const safeUnits = Number(vault.safeAssetBalance) / 10 ** vault.safeDecimals;

  // REGIME / NAV / MKT / DIV mirror the agent's LATEST on-chain attestation, so
  // the strip shows what the agent actually decided (consistent with the
  // decision_log) — NOT a strip-local guess with hardcoded thresholds. USDY
  // trades ~7% below NAV at baseline, so a hardcoded 50/500-bps rule would
  // scream TERMINAL even while the agent (calibrated thresholds) stays CALM.
  // entries[0] is the most recent (useDecisionLog reverses lastFive newest-first).
  const latest = log.entries[0];
  const hasAttestation = log.entries.length > 0;

  let regime: string;
  let navUsd: number;
  let mktUsd: number;
  if (hasAttestation) {
    regime = shortRegime(latest?.payload?.regime);
    const navFromAtt = priceFromWei(latest?.payload?.signals?.navPrice);
    const mktFromAtt = priceFromWei(latest?.payload?.signals?.marketPrice);
    navUsd = isFinite(navFromAtt) ? navFromAtt : Number(oracle.priceWei) / 1e18;
    mktUsd = isFinite(mktFromAtt) ? mktFromAtt : Number(dex.priceWei) / 1e18;
  } else {
    // FALLBACK before the first attestation lands: live oracle + dex reads (with
    // the decimal-correct dex probe applied). Show "—" regime so the row is
    // never blank — but also never asserts a regime the agent hasn't decided.
    regime = "—";
    navUsd = Number(oracle.priceWei) / 1e18;
    mktUsd = Number(dex.priceWei) / 1e18;
  }
  const divergenceBps =
    navUsd > 0 ? Math.max(0, Math.round(((navUsd - mktUsd) / navUsd) * 10000)) : 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.14em",
          color: "var(--text-muted)",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {`// protected_position`}
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 300,
          color: "var(--ink-cyan)",
          lineHeight: 1,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        {decimalsReady ? fmtUsd(tvlUsd) : "…"}
      </div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
        {isConnected ? (
          // Connected: the user's own stake (value · entry · Δ).
          <>
            {decimalsReady ? fmtAssetUnits(userValueUsd) : "…"} {vault.assetSymbol || "…"}  ·  entry {decimalsReady ? fmtUsd(entryUsd) : "…"}  ·  Δ{" "}
            <span style={{ color: "var(--ink-cyan)" }}>{deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%</span>
          </>
        ) : (
          // No wallet (demo): vault composition — risk vs safe holdings. Visibly
          // flips e.g. "100.00 USDY · 0.00 USDC" → "0.00 USDY · 100.00 USDC"
          // after the agent swaps into safety.
          <>
            {decimalsReady ? fmtAssetUnits(riskUnits) : "…"} {vault.assetSymbol || "…"}  ·  {decimalsReady ? fmtAssetUnits(safeUnits) : "…"} {vault.safeSymbol || "…"}
          </>
        )}
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        <span>REGIME:<span style={{ color: regime === "CALM" ? "var(--ink-cyan)" : "var(--warm-gold)" }}>{regime}</span></span>
        <span>DIV:{divergenceBps}bps</span>
        <span>ATTEST:{log.attestationsTotal}/{log.attestationsTotal}</span>
        <span>NAV <span style={{ color: "var(--text-strong)" }}>{navUsd.toFixed(3)}</span></span>
        <span>MKT <span style={{ color: "var(--ink-cyan-bright)" }}>{mktUsd.toFixed(3)}</span></span>
      </div>
    </div>
  );
}
