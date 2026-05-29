"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";
import Panel from "./Panel";
import PresetPicker from "./PresetPicker";
import type { PolicyPreset } from "../lib/mockData";
import { useDeposit } from "../lib/hooks/useDeposit";

interface OnboardingFlowProps {
  onDeposit: (preset: PolicyPreset["id"], amountUsd: number) => void;
}

function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected, address, ensName }) => (
        <button
          type="button"
          onClick={show}
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
          {isConnected
            ? `[ ${ensName ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`} ]`
            : "[ connect wallet ]"}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

export default function OnboardingFlow({ onDeposit }: OnboardingFlowProps) {
  const { isConnected } = useAccount();
  const [preset, setPreset] = useState<PolicyPreset["id"]>("balanced");
  const [amount, setAmount] = useState<string>("100");
  const dep = useDeposit();
  const explorer = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

  // Fire onDeposit once when the flow transitions to "done". A ref ensures
  // we don't double-fire on subsequent re-renders that happen to have
  // state === "done" but no actual transition.
  const firedRef = useRef(false);
  useEffect(() => {
    if (dep.state === "done" && !firedRef.current) {
      firedRef.current = true;
      onDeposit(preset, Number(amount));
    }
    // If user starts a new deposit (transitions away from done/error), reset.
    if (dep.state === "idle" || dep.state === "approving" || dep.state === "depositing") {
      firedRef.current = false;
    }
  }, [dep.state, onDeposit, preset, amount]);

  if (!isConnected) {
    return (
      <Panel title={`// session`} meta="[ AUTH ]">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18, padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: 22, color: "var(--text-strong)", fontWeight: 300, marginBottom: 6, letterSpacing: "-0.01em" }}>
              Connect a wallet to begin.
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Solvent never custodies your asset. Vault is on-chain; agent reads price/NAV and writes ERC-8004 attestations.
            </div>
          </div>
          <ConnectButton />
        </div>
      </Panel>
    );
  }

  const amountRaw = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return BigInt(0);
    return BigInt(Math.floor(n * 1_000_000));
  })();

  const onClickDeposit = async () => {
    if (amountRaw === BigInt(0)) return;
    await dep.deposit(amountRaw);
    // onDeposit is invoked by the useEffect above once dep.state transitions
    // to "done" (state updates from useDeposit are async via useState).
  };

  const busy = dep.state === "approving" || dep.state === "depositing";

  return (
    <Panel title={`// session`} meta="[ READY ]">
      <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "10px 0" }}>
        <ConnectButton />

        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            {"// amount (USDT0)"}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            style={{
              background: "rgba(124,213,255,.04)",
              border: "1px solid rgba(124,213,255,.25)",
              color: "var(--text-strong)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 14,
              width: 180,
            }}
          />
        </div>

        <PresetPicker selected={preset} onSelect={setPreset} />

        <button
          type="button"
          onClick={onClickDeposit}
          disabled={busy || amountRaw === BigInt(0)}
          style={{
            cursor: busy ? "wait" : "pointer",
            background: busy ? "transparent" : "var(--ink-cyan)",
            border: "1px solid var(--ink-cyan)",
            color: busy ? "var(--ink-cyan)" : "var(--bg-deep)",
            padding: "10px 22px",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderRadius: 2,
            opacity: amountRaw === BigInt(0) ? 0.4 : 1,
          }}
        >
          {dep.state === "approving" ? "[ approving… ]"
           : dep.state === "depositing" ? "[ depositing… ]"
           : dep.state === "done" ? "[ deposited ✓ ]"
           : "[ deposit ]"}
        </button>

        {dep.approveTxHash && (
          <a href={`${explorer}/tx/${dep.approveTxHash}`} target="_blank" rel="noreferrer"
             className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
            approve tx → {dep.approveTxHash.slice(0, 10)}…
          </a>
        )}
        {dep.depositTxHash && (
          <a href={`${explorer}/tx/${dep.depositTxHash}`} target="_blank" rel="noreferrer"
             className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
            deposit tx → {dep.depositTxHash.slice(0, 10)}…
          </a>
        )}
        {dep.error && (
          <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
            error: {dep.error}
          </div>
        )}
      </div>
    </Panel>
  );
}
