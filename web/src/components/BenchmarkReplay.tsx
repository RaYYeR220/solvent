"use client";

import { useEffect, useState } from "react";
import Panel from "./Panel";
import { fetchBenchmark, type BenchmarkReport, type DecisionLogEntry } from "../lib/benchmark";

const REASON_COLOUR: Record<string, string> = {
  "park-calm": "var(--ink-cyan-bright)",
  "liquidity-bridge": "var(--ink-cyan)",
  "bridge-holding": "var(--text-strong)",
  "swap-safe": "var(--ink-cyan)",
  "remain-safe": "var(--text-strong)",
  "observe": "var(--warm-gold)",
};

export default function BenchmarkReplay() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);

  useEffect(() => {
    fetchBenchmark()
      .then(setReport)
      .catch((err) => console.error("benchmark fetch failed", err));
  }, []);

  if (!report) {
    return (
      <Panel title={`// benchmark · terminal_collapse`} meta="[ REPLAY ]">
        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
          loading scenario&hellip;
        </div>
      </Panel>
    );
  }

  const terminal = report.scenarios.find((s) => s.name === "terminal-collapse");
  if (!terminal) return null;
  const ai = terminal.results.find((r) => r.strategyName === "solvent-ai");
  if (!ai) return null;

  return (
    <Panel title={`// benchmark · terminal_collapse`} meta={`[ ${ai.log.length} TICKS ]`}>
      <div className="mono" style={{ fontSize: 11.5 }}>
        {ai.log.map((entry: DecisionLogEntry) => {
          const valueUsd = Number(entry.valueAfter) / 1_000_000; // safe-asset has 6 decimals (USDC)
          const colour = REASON_COLOUR[entry.reasonCode] ?? "var(--ink-cyan-bright)";
          return (
            <div
              key={entry.timestamp}
              style={{
                display: "flex",
                gap: 14,
                padding: "6px 0",
                borderBottom: "1px solid rgba(124,213,255,.08)",
                alignItems: "center",
              }}
            >
              <span style={{ opacity: 0.45, minWidth: 56 }}>t+{(entry.timestamp / 3600).toFixed(0)}h</span>
              <span style={{ color: colour, minWidth: 130 }}>{entry.reasonCode}</span>
              <span style={{ flex: 1, color: "var(--text-muted)" }}>regime={entry.regime}&nbsp;&middot;&nbsp;action={entry.action}</span>
              <span style={{ color: "var(--text-strong)" }}>${valueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
