"use client";

import { useState } from "react";
import BrandMark from "@/components/BrandMark";
import DashboardFrame from "@/components/DashboardFrame";
import HeroStat from "@/components/HeroStat";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import Footer from "@/components/Footer";
import OnboardingFlow from "@/components/OnboardingFlow";
import { mockVault, mockPolicy, mockLog, PRESETS, type PolicyPreset } from "@/lib/mockData";

export default function DashboardPage() {
  const [deposited, setDeposited] = useState(false);
  const [activePreset, setActivePreset] = useState<PolicyPreset["id"]>("balanced");
  const [depositAmount, setDepositAmount] = useState<number>(mockVault.entryUsd);

  const handleDeposit = (preset: PolicyPreset["id"], amount: number) => {
    setActivePreset(preset);
    setDepositAmount(amount);
    setDeposited(true);
  };

  // Derived view: scale vault numbers if the user changed the deposit amount.
  const presetCfg = PRESETS.find((p) => p.id === activePreset) ?? PRESETS[1];
  const policyView = {
    ...mockPolicy,
    earlyTrigBps: presetCfg.earlyTrigBps,
    termTrigBps: presetCfg.termTrigBps,
    maxLtvPct: presetCfg.maxLtvPct,
  };
  const scale = depositAmount / mockVault.entryUsd;
  const vaultView = {
    ...mockVault,
    entryUsd: depositAmount,
    protectedPositionUsd: Math.round(mockVault.protectedPositionUsd * scale),
    usdyBalance: +(mockVault.usdyBalance * scale).toFixed(2),
  };

  return (
    <DashboardFrame>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={32} />
          <div>
            <div style={{ fontSize: 17, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.75, marginTop: 2 }}>
              DEPEG.GUARDIAN  &middot;  {vaultView.agentRevision}
            </div>
          </div>
        </div>
        <div className="mono" style={{ textAlign: "right", fontSize: 11, lineHeight: 1.95, color: "var(--text-muted)" }}>
          <div style={{ color: "var(--ink-cyan)" }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--ink-cyan)", marginRight: 6, verticalAlign: "middle" }} />
            {deposited ? vaultView.regime : "OFFLINE"} &nbsp;&middot;&nbsp; {vaultView.asset} / {vaultView.network}
          </div>
          <div>{deposited ? vaultView.address : "—"}</div>
          <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: "0.08em" }}>{vaultView.drawingId}  &middot;  2026-05-28</div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          {deposited ? "section A  ·  main view" : "section A  ·  onboarding"}
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      {!deposited ? (
        <OnboardingFlow onDeposit={handleDeposit} />
      ) : (
        <>
          <HeroStat vault={vaultView} />
          <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 14, marginBottom: 14 }}>
            <ChartPanel vault={vaultView} />
            <PolicyPanel policy={policyView} />
          </div>
          <DecisionLog entries={mockLog} attestationsAttested={vaultView.attestationsAttested} attestationsTotal={vaultView.attestationsTotal} />
        </>
      )}

      <Footer revision={vaultView.agentRevision} drawingId={vaultView.drawingId} network={vaultView.network} />
    </DashboardFrame>
  );
}
