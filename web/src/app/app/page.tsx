"use client";

import BrandMark from "@/components/BrandMark";
import DashboardFrame from "@/components/DashboardFrame";
import HeroStat from "@/components/HeroStat";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import Footer from "@/components/Footer";
import { mockVault, mockPolicy, mockLog } from "@/lib/mockData";

export default function DashboardPage() {
  return (
    <DashboardFrame>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={32} />
          <div>
            <div style={{ fontSize: 17, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.75, marginTop: 2 }}>
              DEPEG.GUARDIAN  &middot;  {mockVault.agentRevision}
            </div>
          </div>
        </div>
        <div className="mono" style={{ textAlign: "right", fontSize: 11, lineHeight: 1.95, color: "var(--text-muted)" }}>
          <div style={{ color: "var(--ink-cyan)" }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--ink-cyan)", marginRight: 6, verticalAlign: "middle" }} />
            {mockVault.regime} &nbsp;&middot;&nbsp; {mockVault.asset} / {mockVault.network}
          </div>
          <div>{mockVault.address}</div>
          <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: "0.08em" }}>{mockVault.drawingId}  &middot;  2026-05-28</div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          section A  &middot;  main view
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      {/* HERO STAT */}
      <HeroStat vault={mockVault} />

      {/* 2-COL grid */}
      <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 14, marginBottom: 14 }}>
        <ChartPanel vault={mockVault} />
        <PolicyPanel policy={mockPolicy} />
      </div>

      {/* LOG */}
      <DecisionLog entries={mockLog} attestationsAttested={mockVault.attestationsAttested} attestationsTotal={mockVault.attestationsTotal} />

      {/* FOOTER */}
      <Footer revision={mockVault.agentRevision} drawingId={mockVault.drawingId} network={mockVault.network} />
    </DashboardFrame>
  );
}
