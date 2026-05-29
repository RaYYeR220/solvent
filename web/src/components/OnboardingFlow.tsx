"use client";

import { useState } from "react";
import Panel from "./Panel";
import PresetPicker from "./PresetPicker";
import type { PolicyPreset } from "../lib/mockData";

type OnboardingStage = "disconnected" | "connected";

interface OnboardingFlowProps {
  /** Fires when the user clicks Deposit on the final step. */
  onDeposit: (preset: PolicyPreset["id"], amountUsd: number) => void;
}

export default function OnboardingFlow({ onDeposit }: OnboardingFlowProps) {
  const [stage, setStage] = useState<OnboardingStage>("disconnected");
  const [preset, setPreset] = useState<PolicyPreset["id"]>("balanced");
  const [amount, setAmount] = useState<string>("100000");

  if (stage === "disconnected") {
    return (
      <Panel title={`// session`} meta="[ AUTH ]">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18, padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: 22, color: "var(--text-strong)", fontWeight: 300, marginBottom: 6, letterSpacing: "-0.01em" }}>
              Connect a wallet to begin.
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Solvent never custodies your USDY. Vault is on-chain; agent reads price/NAV and writes ERC-8004 attestations.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStage("connected")}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--ink-cyan)",
              color: "var(--ink-cyan)",
              padding: "10px 22px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              borderRadius: 2,
            }}
          >
            [ connect wallet ]
          </button>
        </div>
      </Panel>
    );
  }

  // Connected: show preset picker + deposit amount + deposit button.
  const amountNum = Number(amount);
  const canDeposit = amountNum > 0 && Number.isFinite(amountNum);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title={`// strategy`} meta="[ CFG ]">
        <PresetPicker selected={preset} onSelect={setPreset} />
      </Panel>
      <Panel title={`// deposit`} meta="[ TX ]">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="mono" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            amount (usd)
            <input
              type="number"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-cyan)",
                color: "var(--text-strong)",
                fontFamily: "var(--font-mono), monospace",
                fontSize: 16,
                padding: "10px 12px",
                borderRadius: 2,
                outline: "none",
              }}
            />
          </label>
          <button
            type="button"
            disabled={!canDeposit}
            onClick={() => canDeposit && onDeposit(preset, amountNum)}
            style={{
              cursor: canDeposit ? "pointer" : "not-allowed",
              opacity: canDeposit ? 1 : 0.4,
              background: "var(--ink-cyan)",
              border: "none",
              color: "var(--bg-base)",
              padding: "12px 24px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              borderRadius: 2,
              alignSelf: "flex-start",
            }}
          >
            [ deposit ${amountNum.toLocaleString("en-US")} ]
          </button>
        </div>
      </Panel>
    </div>
  );
}
