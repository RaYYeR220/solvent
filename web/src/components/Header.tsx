"use client";

import { ConnectKitButton } from "connectkit";
import BrandMark from "./BrandMark";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDecisionLog } from "../lib/hooks/useDecisionLog";

const AGENT_REVISION = "v2.5.0";

function fmtLastTick(blockNumber: bigint | undefined, payloadTs: number | undefined): string {
  if (typeof payloadTs === "number" && payloadTs > 0) {
    return new Date(payloadTs * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (blockNumber !== undefined && blockNumber > BigInt(0)) return `blk ${blockNumber.toString()}`;
  return "—";
}

function StatusDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      marginRight: 6,
      verticalAlign: "middle",
    }} />
  );
}

export default function Header() {
  const vault = useVaultState();
  const log = useDecisionLog();

  const killColor = vault.killSwitch ? "var(--warm-gold)" : "var(--ink-cyan)";
  const killText  = vault.killSwitch ? "KILLSWITCH: ON " : "KILLSWITCH: OFF";

  const latest = log.entries[0];
  const lastTickStr = fmtLastTick(latest?.blockNumber, latest?.payload?.timestamp);
  // Agent live if a tick landed within the last ~2 hours.
  const recentMs = latest?.payload?.timestamp ? Date.now() - latest.payload.timestamp * 1000 : Number.POSITIVE_INFINITY;
  const agentLive = recentMs < 2 * 60 * 60 * 1000;
  const agentColor = agentLive ? "var(--ink-cyan)" : "rgba(207,231,255,.35)";
  const agentText  = agentLive ? `AGENT: LIVE  · last tick ${lastTickStr}` : `AGENT: IDLE  · last tick ${lastTickStr}`;

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 22,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BrandMark size={32} />
        <div>
          <div style={{ fontSize: 17, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.75, marginTop: 2 }}>
            DEPEG.GUARDIAN  ·  {AGENT_REVISION}
          </div>
        </div>
      </div>

      <div className="mono" style={{ textAlign: "right", fontSize: 11, lineHeight: 1.95, color: "var(--text-muted)" }}>
        <div style={{ color: killColor }}>
          <StatusDot color={killColor} />
          {killText}
        </div>
        <div style={{ color: agentColor }}>
          <StatusDot color={agentColor} />
          {agentText}
        </div>
        <div>
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, address }) => (
              <button
                type="button"
                onClick={show}
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid rgba(124,213,255,.35)",
                  color: "var(--ink-cyan)",
                  padding: "2px 10px",
                  fontFamily: "inherit",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  borderRadius: 2,
                }}
              >
                {isConnected ? `◇ ${truncatedAddress ?? (address ? `${address.slice(0,6)}…${address.slice(-4)}` : "wallet")} · disconnect` : "◇ connect wallet"}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    </div>
  );
}
