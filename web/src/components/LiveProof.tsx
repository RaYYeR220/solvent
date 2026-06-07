"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Panel from "./Panel";
import { useDecisionLog } from "../lib/hooks/useDecisionLog";
import { CONTRACTS } from "../lib/contracts";

const MANTLESCAN = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

// ---------- helpers ----------

function timeAgo(unixSeconds: number | undefined): string {
  if (!unixSeconds || unixSeconds <= 0) return "—";
  const secs = Math.floor(Date.now() / 1000 - unixSeconds);
  if (secs < 60) return `${Math.max(secs, 0)}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function hhmm(unixSeconds: number | undefined): string {
  if (!unixSeconds || unixSeconds <= 0) return "—";
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** On-chain ActionType → human label. NONE/empty = the agent observed and
 *  decided no protective action was needed (the correct call in calm markets). */
function actionLabel(action: string | undefined): string {
  switch (action) {
    case "SWAP_TO_SAFE":       return "swap → safe";
    case "BRIDGE_VIA_LENDING": return "bridge → lending";
    case "UNWIND_BRIDGE":      return "unwind bridge";
    case "PARK_YIELD":         return "park yield";
    case "NONE":
    case undefined:
    case "":                   return "observe";
    default:                   return action.toLowerCase();
  }
}

function shortTx(h: string): string {
  return h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—";
}

/** Render client-only on-chain data behind a mounted flag so the server HTML
 *  and the first client paint match (wagmi data is empty until hydration). */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function LiveDot({ size = 7 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--ink-cyan-bright)",
        boxShadow: "0 0 8px rgba(124,213,255,.8)",
        flexShrink: 0,
      }}
    />
  );
}

// ---------- hero badge (compact) ----------

export function LiveBadge() {
  const mounted = useMounted();
  const log = useDecisionLog();
  const lastTs = log.entries[0]?.payload?.timestamp;
  const ready = mounted && log.attestationsTotal > 0;

  return (
    <div
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        fontSize: 12,
        color: "var(--text-muted)",
        border: "1px solid var(--border-cyan-faint)",
        borderRadius: 2,
        padding: "7px 13px",
        background: "rgba(124,213,255,.03)",
      }}
    >
      <LiveDot />
      <span style={{ color: "var(--ink-cyan)", letterSpacing: "0.04em" }}>Agent live on Mantle</span>
      {ready ? (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span><span style={{ color: "var(--text-strong)" }}>{log.attestationsTotal}</span> attestations</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>last tick {timeAgo(lastTs)}</span>
        </>
      ) : (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ opacity: 0.7 }}>{mounted ? "reading chain…" : "connecting…"}</span>
        </>
      )}
    </div>
  );
}

// ---------- full live-proof section ----------

const linkBtnStyle: React.CSSProperties = {
  border: "1px solid var(--border-cyan)",
  color: "var(--ink-cyan)",
  padding: "9px 16px",
  fontSize: 11.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 2,
  textDecoration: "none",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--ink-cyan)",
  color: "var(--bg-base)",
  padding: "9px 18px",
  fontSize: 11.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 2,
  textDecoration: "none",
  fontWeight: 600,
};

export default function LiveProof() {
  const mounted = useMounted();
  const log = useDecisionLog();
  const recent = log.entries.slice(0, 4);
  const lastTs = log.entries[0]?.payload?.timestamp;
  const loading = !mounted || (log.isLoading && recent.length === 0);

  return (
    <Panel title="// live_proof · on-chain attestations" meta="[ ERC-8004 · mantle mainnet ]">
      {/* status row */}
      <div
        className="mono"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          fontSize: 12.5,
          color: "var(--text-muted)",
          paddingBottom: 14,
          borderBottom: "1px solid rgba(124,213,255,.1)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink-cyan)" }}>
          <LiveDot /> LIVE
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>agent ticking hourly</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>
          <span style={{ color: "var(--text-strong)" }}>{mounted ? log.attestationsTotal : "—"}</span> attestations on-chain
        </span>
        {mounted && lastTs && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>last tick {timeAgo(lastTs)}</span>
          </>
        )}
      </div>

      {/* recent decisions */}
      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", opacity: 0.7, padding: "8px 0" }}>
            reading on-chain attestations&hellip;
          </div>
        ) : recent.length === 0 ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", opacity: 0.7, padding: "8px 0" }}>
            awaiting next tick&hellip;
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 12 }}>
            {recent.map((e, i) => (
              <div
                key={e.txHash || i}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "7px 0",
                  borderBottom: i === recent.length - 1 ? "none" : "1px solid rgba(124,213,255,.06)",
                }}
              >
                <span style={{ color: "var(--text-muted)", minWidth: 52 }}>{hhmm(e.payload?.timestamp)}</span>
                <span style={{ color: "var(--text-strong)", minWidth: 100 }}>
                  {e.payload?.regime ?? (e.payloadLoading ? "…" : "—")}
                </span>
                <span style={{ color: "var(--ink-cyan)", flex: 1 }}>{actionLabel(e.payload?.decision?.action)}</span>
                <a
                  href={`${MANTLESCAN}/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--ink-cyan)", opacity: 0.85, textDecoration: "none" }}
                >
                  {shortTx(e.txHash)} ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <a
          href={`${MANTLESCAN}/address/${CONTRACTS.attestation}`}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={linkBtnStyle}
        >
          [ verify on Mantlescan ↗ ]
        </a>
        <Link href="/app" className="mono" style={primaryBtnStyle}>
          open live dashboard →
        </Link>
      </div>
    </Panel>
  );
}
