"use client";

import { useState, useMemo } from "react";
import Panel from "./Panel";
import type { DecisionEntry } from "../lib/hooks/useDecisionLog";

const EXPLORER = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";
const VIEW_W = 200;
const VIEW_H = 80;
const NAV_MID = 1.0;
const Y_HALF = 0.005;
const TOP_VAL = NAV_MID + Y_HALF;
const BOT_VAL = NAV_MID - Y_HALF;

interface ChartPanelProps {
  entries: DecisionEntry[];
}

interface Pt { x: number; y: number; entry: DecisionEntry; nav: number; mkt: number; }

function priceFromWei(s: string | undefined): number {
  if (!s) return NaN;
  try {
    return Number(BigInt(s)) / 1e18;
  } catch {
    return NaN;
  }
}

function clampToView(price: number): number {
  const t = (TOP_VAL - price) / (TOP_VAL - BOT_VAL);
  return Math.max(0, Math.min(VIEW_H, t * VIEW_H));
}

function shortHash(h: string): string {
  return h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—";
}

export default function ChartPanel({ entries }: ChartPanelProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const pts: Pt[] = useMemo(() => {
    const sorted = [...entries].sort((a, b) =>
      a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0,
    );
    const n = sorted.length;
    if (n === 0) return [];
    return sorted.map((e, i) => {
      const nav = priceFromWei(e.payload?.signals?.navPrice);
      const mkt = priceFromWei(e.payload?.signals?.marketPrice);
      const x = n === 1 ? VIEW_W / 2 : (i * VIEW_W) / (n - 1);
      return {
        x,
        y: clampToView(isFinite(nav) ? nav : NAV_MID),
        entry: e,
        nav: isFinite(nav) ? nav : NAV_MID,
        mkt: isFinite(mkt) ? mkt : NAV_MID,
      };
    });
  }, [entries]);

  const navPath = useMemo(() => {
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${clampToView(p.nav).toFixed(2)}`).join(" ");
  }, [pts]);

  const mktPath = useMemo(() => {
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${clampToView(p.mkt).toFixed(2)}`).join(" ");
  }, [pts]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (pts.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const xInView = Math.max(0, Math.min(VIEW_W, ratio * VIEW_W));
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - xInView);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    setHoverIdx(best);
  }

  function onLeave() {
    setHoverIdx(null);
  }

  if (pts.length === 0) {
    return (
      <Panel title="// price_nav_feed · last N attestations" meta="[ CH-A ]">
        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", padding: "32px 0", textAlign: "center" }}>
          awaiting attestations&hellip;
        </div>
      </Panel>
    );
  }

  const hover = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <Panel title="// price_nav_feed · last N attestations" meta="[ CH-A ]">
      <div style={{ position: "relative" }}>
        <svg
          width="100%"
          height="160"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", marginBottom: 10 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id="chart-grad-a" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-cyan)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--ink-cyan)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} stroke="var(--ink-cyan)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
          <text x="2" y="9" fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">{TOP_VAL.toFixed(3)}</text>
          <text x="2" y={VIEW_H / 2 + 4} fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">NAV 1.000</text>
          <text x="2" y={VIEW_H - 4} fontSize="6" fill="var(--text-muted)" fontFamily="var(--font-mono), monospace">{BOT_VAL.toFixed(3)}</text>
          <path d={mktPath} stroke="var(--ink-cyan-bright)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          <path d={navPath} stroke="var(--text-strong)" strokeWidth="1.2" fill="none" strokeLinejoin="round" opacity="0.8" />
          <circle cx={pts[pts.length - 1].x} cy={clampToView(pts[pts.length - 1].mkt)} r="2.5" fill="var(--ink-cyan-bright)" />
          {hover && (
            <>
              <line x1={hover.x} y1="0" x2={hover.x} y2={VIEW_H} stroke="var(--ink-cyan)" strokeWidth="0.5" opacity="0.6" />
              <circle cx={hover.x} cy={clampToView(hover.nav)} r="1.5" fill="var(--text-strong)" />
              <circle cx={hover.x} cy={clampToView(hover.mkt)} r="1.5" fill="var(--ink-cyan-bright)" />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="mono"
            style={{
              position: "absolute",
              top: 4,
              right: 8,
              padding: "8px 10px",
              background: "rgba(10,25,50,0.92)",
              border: "1px solid rgba(124,213,255,.25)",
              fontSize: 10.5,
              lineHeight: 1.6,
              color: "var(--text-muted)",
              pointerEvents: "none",
              minWidth: 160,
            }}
          >
            <div style={{ color: "var(--text-strong)" }}>tick #{hover.entry.payload?.tick ?? "?"}</div>
            <div>regime {hover.entry.payload?.regime ?? "?"}</div>
            <div>action {hover.entry.payload?.decision?.action ?? "—"}</div>
            <div>NAV {hover.nav.toFixed(4)}</div>
            <div>MKT <span style={{ color: "var(--ink-cyan-bright)" }}>{hover.mkt.toFixed(4)}</span></div>
            <div>
              tx{" "}
              <a href={`${EXPLORER}/tx/${hover.entry.txHash}`} target="_blank" rel="noreferrer"
                 style={{ color: "var(--ink-cyan)", textDecoration: "none", pointerEvents: "auto" }}>
                {shortHash(hover.entry.txHash)}
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="mono" style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <span>MKT line=<span style={{ color: "var(--ink-cyan-bright)" }}>cyan</span></span>
        <span>NAV line=<span style={{ color: "var(--text-strong)" }}>white</span></span>
        <span>N={pts.length} attestations</span>
      </div>
    </Panel>
  );
}
