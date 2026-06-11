"use client";

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

export default function ProtectedPositionStrip() {
  const vault = useVaultState();
  const oracle = useOraclePrice();
  const dex = useDexPrice();
  const log = useDecisionLog();

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

  const navUsd = Number(oracle.priceWei) / 1e18;
  const mktUsd = Number(dex.priceWei) / 1e18;
  const divergenceBps =
    navUsd > 0 ? Math.max(0, Math.round(((navUsd - mktUsd) / navUsd) * 10000)) : 0;
  const regime = divergenceBps >= 500 ? "TERMINAL" : divergenceBps >= 50 ? "EARLY" : "CALM";

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
        {decimalsReady ? fmtAssetUnits(userValueUsd) : "…"} USDT0  ·  entry {decimalsReady ? fmtUsd(entryUsd) : "…"}  ·  Δ{" "}
        <span style={{ color: "var(--ink-cyan)" }}>{deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%</span>
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
