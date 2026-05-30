"use client";

import { useState, useMemo } from "react";
import BrandMark from "@/components/BrandMark";
import DashboardFrame from "@/components/DashboardFrame";
import HeroStat from "@/components/HeroStat";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import Footer from "@/components/Footer";
import OnboardingFlow from "@/components/OnboardingFlow";
import ForkReplay from "@/components/ForkReplay";
import { type PolicyPreset, type VaultState, type PolicyView, type LogEntry } from "@/lib/mockData";
import { useVaultState } from "@/lib/hooks/useVaultState";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { useOraclePrice } from "@/lib/hooks/useOraclePrice";
import { useDexPrice } from "@/lib/hooks/useDexPrice";
import { useDecisionLog } from "@/lib/hooks/useDecisionLog";

const ASSET_DECIMALS = 6;
const ASSET_SYMBOL = "USDT0";
const SAFE_SYMBOL = "USDC";
const AGENT_REVISION = "v2.5.0";
const DRAWING_ID = "DWG-002";
const NETWORK = "MANTLE";

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

function mapReasonCode(raw: string | undefined): LogEntry["reasonCode"] {
  switch (raw) {
    case "observe":
    case "watch":
      return "observe";
    case "liquidity-bridge":
    case "bridge":
      return "bridge";
    case "unwind":
      return "unwind";
    case "early-exit":
    case "terminal-exit":
    case "swap":
      return "swap";
    case "park-calm":
    case "calm-idle":
    default:
      return "park-calm";
  }
}

export default function DashboardPage() {
  const [activePreset, setActivePreset] = useState<PolicyPreset["id"]>("balanced");
  const [deposited, setDeposited] = useState(false);

  const vault = useVaultState();
  const policy = usePolicy();
  const oracle = useOraclePrice();
  const dex = useDexPrice();
  const log = useDecisionLog();

  const assetBalanceDisplay = Number(vault.assetBalance) / 10 ** ASSET_DECIMALS;
  const navUsd = Number(oracle.priceWei) / 1e18;
  const mktUsd = Number(dex.priceWei) / 1e18;
  const divergenceBps =
    navUsd > 0 ? Math.max(0, Math.round(((navUsd - mktUsd) / navUsd) * 10000)) : 0;

  const regime: VaultState["regime"] =
    divergenceBps >= (policy.terminalDivergenceBps || 500)
      ? "TERMINAL"
      : divergenceBps >= (policy.earlyDivergenceBps || 50)
      ? "EARLY"
      : "CALM";

  const vaultView: VaultState = useMemo(
    () => ({
      protectedPositionUsd: Math.round(assetBalanceDisplay),
      usdyBalance: +assetBalanceDisplay.toFixed(2),
      entryUsd: Math.round(assetBalanceDisplay) || 1,
      deltaPct: 0,
      marketPrice: +mktUsd.toFixed(4),
      navPrice: +navUsd.toFixed(4),
      spreadBps: -divergenceBps,
      regime,
      divergenceBps,
      tickLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attestationsAttested: log.attestationsTotal,
      attestationsTotal: log.attestationsTotal,
      address: vault.address,
      asset: ASSET_SYMBOL,
      network: NETWORK,
      agentRevision: AGENT_REVISION,
      drawingId: DRAWING_ID,
    }),
    [assetBalanceDisplay, mktUsd, navUsd, divergenceBps, regime, vault.address, log.attestationsTotal],
  );

  const policyView: PolicyView = useMemo(
    () => ({
      earlyTrigBps: policy.earlyDivergenceBps,
      termTrigBps: policy.terminalDivergenceBps,
      maxLtvPct: Math.round(policy.maxBridgeLTVBps / 100),
      safeAsset: SAFE_SYMBOL,
      slippageCapBps: policy.maxSlippageBps,
      // T14 will wire these from on-chain policy bitmask + vault state.
      allowSwap: false,
      allowBridge: false,
      killSwitch: false,
    }),
    [
      policy.earlyDivergenceBps,
      policy.terminalDivergenceBps,
      policy.maxBridgeLTVBps,
      policy.maxSlippageBps,
    ],
  );

  function entryTimestamp(e: { payload: { timestamp?: number } | undefined; payloadLoading: boolean }): string {
    const ts = e.payload?.timestamp;
    if (typeof ts === "number" && ts > 0) {
      // Payload `timestamp` is Unix seconds (set by agent at signal-gather time).
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

  const handleDeposit = () => {
    setDeposited(true);
  };

  const showOnboarding = !deposited && vault.assetBalance === BigInt(0);

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
            {showOnboarding ? "OFFLINE" : vaultView.regime} &nbsp;&middot;&nbsp; {vaultView.asset} / {vaultView.network}
          </div>
          <div>{showOnboarding ? "—" : vaultView.address}</div>
          <div style={{ opacity: 0.55, fontSize: 10, letterSpacing: "0.08em" }}>{vaultView.drawingId}  &middot;  preset: {activePreset}</div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          {showOnboarding ? "section A  ·  onboarding" : "section A  ·  main view"}
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      {showOnboarding ? (
        <OnboardingFlow onDeposit={(preset) => { setActivePreset(preset); handleDeposit(); }} />
      ) : (
        <>
          <HeroStat vault={vaultView} />
          <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 20 }}>
            <ChartPanel vault={vaultView} />
            <PolicyPanel policy={policyView} />
          </div>
          <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 22 }}>
            <DecisionLog entries={logEntries} attestationsAttested={vaultView.attestationsAttested} attestationsTotal={vaultView.attestationsTotal} />
            <ForkReplay />
          </div>
        </>
      )}

      <Footer revision={vaultView.agentRevision} drawingId={vaultView.drawingId} network={vaultView.network} />
    </DashboardFrame>
  );
}
