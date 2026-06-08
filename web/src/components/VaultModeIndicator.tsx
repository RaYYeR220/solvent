"use client";

import { useVaultMode } from "../lib/hooks/useVaultMode";

// Risk asset (USDY) is 18-dec collateral; safe asset (USDC) is 6-dec debt.
const COLLATERAL_DECIMALS = 18;
const DEBT_DECIMALS = 6;

function fmtUnits(raw: bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VaultModeIndicator() {
  const { mode, collateral, debt } = useVaultMode();
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
          collateral <span style={{ color: "var(--text-strong)" }}>{fmtUnits(collateral, COLLATERAL_DECIMALS)}</span> USDY
          {"  ·  "}
          borrowed <span style={{ color: "var(--text-strong)" }}>{fmtUnits(debt, DEBT_DECIMALS)}</span> USDC
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
