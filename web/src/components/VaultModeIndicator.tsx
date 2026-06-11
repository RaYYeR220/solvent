"use client";

import { useVaultMode } from "../lib/hooks/useVaultMode";
import { useVaultState } from "../lib/hooks/useVaultState";

function fmtUnits(raw: bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VaultModeIndicator() {
  const { mode, collateral, debt } = useVaultMode();
  // Collateral is the vault's risk asset; debt is its safe asset. Pull both the
  // symbols AND decimals from chain so labels/magnitudes are correct for ANY
  // vault (USDY collateral + USDC debt on the fork, …) — never hardcoded.
  const vault = useVaultState();
  const COLLATERAL_DECIMALS = vault.assetDecimals;
  const DEBT_DECIMALS = vault.safeDecimals;
  const COLLATERAL_SYMBOL = vault.assetSymbol || "…";
  const DEBT_SYMBOL = vault.safeSymbol || "…";
  const bridged = mode === "BRIDGED";
  const accent = bridged ? "var(--warm-gold)" : "var(--ink-cyan)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "9px 14px",
        marginBottom: 22,
        border: `1px solid ${bridged ? "rgba(232,192,96,.28)" : "rgba(124,213,255,.18)"}`,
        borderRadius: 2,
        background: "rgba(124,213,255,.03)",
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}
      >
        {`// vault_mode`}
      </span>
      <span
        className="mono"
        style={{ fontSize: 12.5, letterSpacing: "0.08em", color: accent, fontWeight: 500 }}
      >
        VAULT MODE: {mode}
      </span>
      {bridged && (
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          collateral <span style={{ color: "var(--text-strong)" }}>{fmtUnits(collateral, COLLATERAL_DECIMALS)}</span> {COLLATERAL_SYMBOL}
          {"  ·  "}
          borrowed <span style={{ color: "var(--text-strong)" }}>{fmtUnits(debt, DEBT_DECIMALS)}</span> {DEBT_SYMBOL}
        </span>
      )}
      {!bridged && (
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          holding risk asset directly
        </span>
      )}
    </div>
  );
}
