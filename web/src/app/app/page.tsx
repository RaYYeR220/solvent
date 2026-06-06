"use client";

import DashboardFrame from "@/components/DashboardFrame";
import DashboardHeader from "@/components/DashboardHeader";
import ProtectedPositionStrip from "@/components/ProtectedPositionStrip";
import VaultActions from "@/components/VaultActions";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import Footer from "@/components/Footer";
import { useVaultState } from "@/lib/hooks/useVaultState";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { useDecisionLog } from "@/lib/hooks/useDecisionLog";
import type { PolicyView, LogEntry } from "@/lib/mockData";

const AGENT_REVISION = "v2.5.0";
const DRAWING_ID = "DWG-002";
const NETWORK = "MANTLE";
const SAFE_SYMBOL = "USDC";

const ACTION_SWAP_BIT   = 1 << 1; // ActionType.SWAP_TO_SAFE
const ACTION_BRIDGE_BIT = 1 << 2; // ActionType.BRIDGE_VIA_LENDING

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

function mapReasonCode(raw: string | undefined): LogEntry["reasonCode"] {
  switch (raw) {
    case "observe":
    case "watch":            return "observe";
    case "liquidity-bridge":
    case "bridge":           return "bridge";
    case "unwind":           return "unwind";
    case "early-exit":
    case "terminal-exit":
    case "swap":             return "swap";
    case "park-calm":
    case "calm-idle":
    default:                 return "park-calm";
  }
}

export default function DashboardPage() {
  const vault = useVaultState();
  const policy = usePolicy();
  const log = useDecisionLog();

  const policyView: PolicyView = {
    earlyTrigBps: policy.earlyDivergenceBps,
    termTrigBps: policy.terminalDivergenceBps,
    maxLtvPct: Math.round(policy.maxBridgeLTVBps / 100),
    safeAsset: SAFE_SYMBOL,
    slippageCapBps: policy.maxSlippageBps,
    allowSwap: (policy.allowedActions & ACTION_SWAP_BIT) !== 0,
    allowBridge: (policy.allowedActions & ACTION_BRIDGE_BIT) !== 0,
    killSwitch: vault.killSwitch,
  };

  function entryTimestamp(e: { payload: { timestamp?: number } | undefined; payloadLoading: boolean }): string {
    const ts = e.payload?.timestamp;
    if (typeof ts === "number" && ts > 0) {
      return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return e.payloadLoading ? "…" : "—";
  }

  const logEntries: LogEntry[] = log.entries.map((e): LogEntry => ({
    timestamp: entryTimestamp(e),
    reasonCode: mapReasonCode(e.payload?.decision?.reasonCode),
    description: e.payload?.decision?.action ?? (e.payloadLoading ? "resolving…" : "(no payload)"),
    txShort: shortHash(e.txHash),
    txHash: e.txHash,
  }));

  return (
    <DashboardFrame>
      <DashboardHeader />

      {/* divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          section A  ·  main view
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      <ProtectedPositionStrip />

      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 22, marginTop: 20, alignItems: "stretch" }}>
        <VaultActions />
        <PolicyPanel policy={policyView} />
      </div>

      <div style={{ marginTop: 22 }}>
        <ChartPanel entries={log.entries} />
      </div>

      <div style={{ marginTop: 22 }}>
        <DecisionLog entries={logEntries} attestationsAttested={log.attestationsTotal} attestationsTotal={log.attestationsTotal} />
      </div>

      <Footer revision={AGENT_REVISION} drawingId={DRAWING_ID} network={NETWORK} />
    </DashboardFrame>
  );
}
