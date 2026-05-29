"use client";

import { useEffect, useState } from "react";
import Panel from "./Panel";

const REASON_COLOUR: Record<string, string> = {
  "park-calm": "var(--text-muted)",
  "calm-idle": "var(--text-muted)",
  "watch": "var(--warm-gold)",
  "early-exit": "var(--ink-cyan)",
  "terminal-exit": "var(--ink-cyan-bright)",
  "liquidity-bridge": "var(--ink-cyan)",
  "protect-failed-illiquid": "var(--warm-gold)",
};

interface Tick {
  tick: number;
  timestamp: number;
  regime: string;
  action: string;
  reasonCode: string;
  signals: {
    navPrice: string;
    marketPrice: string;
    liquidityDepth: string;
    assetBalance: string;
  };
  postActionBalance: string;
  txHash: string;
  uri: string;
}

interface ReplayDoc {
  scenario: string;
  ticks: Tick[];
}

type ScenarioId = "transient" | "terminal";
const SCENARIO_URL: Record<ScenarioId, string> = {
  transient: "/replay-transient.json",
  terminal: "/replay-terminal.json",
};

const PLAYBACK_INTERVAL_MS = 1500;

export default function ForkReplay() {
  const [scenario, setScenario] = useState<ScenarioId>("transient");
  const [doc, setDoc] = useState<ReplayDoc | null>(null);
  const [tickIndex, setTickIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const explorer = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

  useEffect(() => {
    let cancelled = false;
    fetch(SCENARIO_URL[scenario])
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setDoc(d as ReplayDoc); setTickIndex(0); } })
      .catch((e) => console.error("ForkReplay fetch failed:", e));
    return () => { cancelled = true; };
  }, [scenario]);

  useEffect(() => {
    if (!playing || !doc) return;
    const id = setInterval(() => {
      setTickIndex((i) => {
        const next = i + 1;
        if (next >= doc.ticks.length) {
          setPlaying(false);
          return doc.ticks.length - 1;
        }
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, doc]);

  const current = doc?.ticks[tickIndex];
  const reasonColour = current ? (REASON_COLOUR[current.reasonCode] ?? "var(--ink-cyan-bright)") : "var(--ink-cyan-bright)";
  const usd = (raw: string) => (Number(BigInt(raw)) / 1_000_000).toFixed(2);

  const picker = (
    <div style={{ display: "flex", gap: 12 }} className="mono">
      {(["transient", "terminal"] as ScenarioId[]).map((id) => (
        <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="radio"
            name="scenario"
            value={id}
            checked={scenario === id}
            onChange={() => setScenario(id)}
            aria-label={id === "transient" ? "transient-depeg" : "terminal-collapse"}
          />
          {id === "transient" ? "transient-depeg" : "terminal-collapse"}
        </label>
      ))}
    </div>
  );

  if (!doc || !current) {
    return (
      <Panel title={`// fork_replay`} meta="[ LOADING ]">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {picker}
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
            loading scenario&hellip;
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`// fork_replay · ${doc.scenario}`} meta={`[ TICK ${tickIndex + 1}/${doc.ticks.length} ]`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {picker}

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--ink-cyan)",
              color: "var(--ink-cyan)",
              padding: "4px 12px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              borderRadius: 2,
            }}
          >
            {playing ? "[ pause ]" : "[ play ]"}
          </button>
          <input
            type="range"
            min={0}
            max={doc.ticks.length - 1}
            value={tickIndex}
            onChange={(e) => setTickIndex(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--ink-cyan)" }}
            aria-label="tick scrubber"
          />
        </div>

        <div className="mono" style={{ fontSize: 12, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", paddingTop: 8, borderTop: "1px solid rgba(124,213,255,.08)" }}>
          <span style={{ color: "var(--text-muted)" }}>regime</span>
          <span style={{ color: "var(--text-strong)" }}>{current.regime}</span>
          <span style={{ color: "var(--text-muted)" }}>action</span>
          <span style={{ color: reasonColour }}>{current.action} · {current.reasonCode}</span>
          <span style={{ color: "var(--text-muted)" }}>mkt price</span>
          <span style={{ color: "var(--text-strong)" }}>${(Number(BigInt(current.signals.marketPrice)) / 1e18).toFixed(4)}</span>
          <span style={{ color: "var(--text-muted)" }}>balance (USDT0)</span>
          <span style={{ color: "var(--text-strong)" }}>{usd(current.signals.assetBalance)} → {usd(current.postActionBalance)}</span>
          <span style={{ color: "var(--text-muted)" }}>tx</span>
          <a href={`${explorer}/tx/${current.txHash}`} target="_blank" rel="noreferrer"
             style={{ color: "var(--ink-cyan)", textDecoration: "none" }}>
            {current.txHash.slice(0, 10)}…
          </a>
        </div>
      </div>
    </Panel>
  );
}
