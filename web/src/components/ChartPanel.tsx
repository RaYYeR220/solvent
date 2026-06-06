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

  // Area fill under the MKT line — gives the chart visual body so a calm
  // (flat ~1.000) series doesn't read as a lonely hairline.
  const areaPath = useMemo(() => {
    if (pts.length === 0) return "";
    const first = pts[0].x.toFixed(2);
    const last = pts[pts.length - 1].x.toFixed(2);
    return `${mktPath} L${last},${VIEW_H} L${first},${VIEW_H} Z`;
  }, [pts, mktPath]);

  // viewBox → percentage helpers for crisp HTML overlays (axis labels, dots)
  // that must NOT inherit the SVG's non-uniform preserveAspectRatio stretch.
  const leftPct = (x: number) => (x / VIEW_W) * 100;
  const topPct = (value: number) => (clampToView(value) / VIEW_H) * 100;

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
  const last = pts[pts.length - 1];

  return (
    <Panel title="// price_nav_feed · last N attestations" meta="[ CH-A ]">
      <div style={{ position: "relative", height: 180 }}>
        <svg
          width="100%"
          height="180"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", position: "absolute", inset: 0 }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id="chart-grad-a" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-cyan)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--ink-cyan)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* mid grid line */}
          <line x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} stroke="var(--ink-cyan)" strokeWidth="0.4" strokeDasharray="3,3" opacity="0.35" vectorEffect="non-scaling-stroke" />
          {/* area fill under MKT */}
          <path d={areaPath} fill="url(#chart-grad-a)" stroke="none" />
          {/* MKT + NAV lines — non-scaling stroke keeps width uniform despite the stretch */}
          <path d={mktPath} stroke="var(--ink-cyan-bright)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={navPath} stroke="var(--text-strong)" strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.75" vectorEffect="non-scaling-stroke" strokeDasharray="2,2" />
          {/* hover crosshair (vertical) */}
          {hover && (
            <line x1={hover.x} y1="0" x2={hover.x} y2={VIEW_H} stroke="var(--ink-cyan)" strokeWidth="1" opacity="0.6" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* axis labels — HTML overlay so they render crisp (SVG text would be stretched by preserveAspectRatio=none) */}
        <div className="mono" style={{ position: "absolute", top: 2, left: 4, fontSize: 10, color: "var(--text-muted)", opacity: 0.7, pointerEvents: "none" }}>{TOP_VAL.toFixed(3)}</div>
        <div className="mono" style={{ position: "absolute", top: "50%", left: 4, transform: "translateY(-50%)", fontSize: 10, color: "var(--text-muted)", opacity: 0.5, pointerEvents: "none" }}>NAV 1.000</div>
        <div className="mono" style={{ position: "absolute", bottom: 2, left: 4, fontSize: 10, color: "var(--text-muted)", opacity: 0.7, pointerEvents: "none" }}>{BOT_VAL.toFixed(3)}</div>

        {/* latest-point dot (HTML so it stays a circle, not a stretched ellipse) */}
        <div style={{
          position: "absolute",
          left: `calc(${leftPct(last.x)}% - 4px)`,
          top: `calc(${topPct(last.mkt)}% - 4px)`,
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--ink-cyan-bright)",
          boxShadow: "0 0 8px rgba(124,213,255,.7)",
          pointerEvents: "none",
        }} />

        {/* hover dots (HTML circles) */}
        {hover && (
          <>
            <div style={{ position: "absolute", left: `calc(${leftPct(hover.x)}% - 3px)`, top: `calc(${topPct(hover.mkt)}% - 3px)`, width: 6, height: 6, borderRadius: "50%", background: "var(--ink-cyan-bright)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: `calc(${leftPct(hover.x)}% - 3px)`, top: `calc(${topPct(hover.nav)}% - 3px)`, width: 6, height: 6, borderRadius: "50%", background: "var(--text-strong)", pointerEvents: "none" }} />
          </>
        )}

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

      <div className="mono" style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
        <span>MKT=<span style={{ color: "var(--ink-cyan-bright)" }}>cyan</span></span>
        <span>NAV=<span style={{ color: "var(--text-strong)" }}>white dashed</span></span>
        <span>N={pts.length} attestations</span>
      </div>
    </Panel>
  );
}
