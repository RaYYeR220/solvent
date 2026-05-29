import type { VaultState } from "../lib/mockData";
import Panel from "./Panel";

interface ChartPanelProps {
  vault: VaultState;
}

export default function ChartPanel({ vault }: ChartPanelProps) {
  return (
    <Panel title="// price_nav_feed · 24h" meta="[ CH-A ]">
      <svg width="100%" height="160" viewBox="0 0 200 80" preserveAspectRatio="none" style={{ display: "block", marginBottom: 10 }}>
        <defs>
          <linearGradient id="chart-grad-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink-cyan)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--ink-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="40" x2="200" y2="40" stroke="var(--ink-cyan)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
        <text x="2" y="9" fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">1.005</text>
        <text x="2" y="44" fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">NAV 1.000</text>
        <text x="2" y="76" fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">0.995</text>
        <path d="M0,42 L30,42 L50,40 L75,46 L110,38 L140,42 L170,40 L200,42 L200,80 L0,80 Z" fill="url(#chart-grad-a)" />
        <path d="M0,42 L30,42 L50,40 L75,46 L110,38 L140,42 L170,40 L200,42" stroke="var(--ink-cyan-bright)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        <circle cx="200" cy="42" r="2.5" fill="var(--ink-cyan-bright)" />
        <circle cx="200" cy="42" r="5" fill="none" stroke="var(--ink-cyan-bright)" strokeWidth="0.6" opacity="0.4" />
      </svg>
      <div className="mono" style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <span>MKT=<span style={{ color: "var(--ink-cyan-bright)" }}>{vault.marketPrice.toFixed(3)}</span></span>
        <span>NAV=<span style={{ color: "var(--text-strong)" }}>{vault.navPrice.toFixed(3)}</span></span>
        <span>SPR=<span style={{ color: "var(--warm-gold)" }}>{vault.spreadBps > 0 ? "+" : ""}{vault.spreadBps} bp</span></span>
      </div>
    </Panel>
  );
}
