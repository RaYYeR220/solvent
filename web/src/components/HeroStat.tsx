import type { VaultState } from "../lib/mockData";

interface HeroStatProps {
  vault: VaultState;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function fmtDelta(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default function HeroStat({ vault }: HeroStatProps) {
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
        // protected_position
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
        {fmtUsd(vault.protectedPositionUsd)}
      </div>
      <div
        className="mono"
        style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}
      >
        {vault.usdyBalance.toFixed(2)} USDY  ·  entry {fmtUsd(vault.entryUsd)}  ·  Δ{" "}
        <span style={{ color: "var(--ink-cyan)" }}>{fmtDelta(vault.deltaPct)}</span>
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
        <span style={{ color: "var(--ink-cyan)" }}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--ink-cyan)",
              marginRight: 5,
              verticalAlign: "middle",
            }}
          />
          AGENT:LIVE
        </span>
        <span>REGIME:{vault.regime}</span>
        <span>DIV:{vault.divergenceBps}bps</span>
        <span>TICK:{vault.tickLabel}</span>
        <span>ATTEST:{vault.attestationsAttested}/{vault.attestationsTotal}</span>
      </div>
    </div>
  );
}
