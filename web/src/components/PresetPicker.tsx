"use client";

import { PRESETS, type PolicyPreset } from "../lib/mockData";

interface PresetPickerProps {
  selected: PolicyPreset["id"];
  onSelect: (id: PolicyPreset["id"]) => void;
}

export default function PresetPicker({ selected, onSelect }: PresetPickerProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {PRESETS.map((p) => {
        const isSelected = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            role="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(p.id)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              background: "var(--bg-panel)",
              border: `1px solid ${isSelected ? "var(--ink-cyan)" : "var(--border-cyan)"}`,
              padding: 16,
              borderRadius: 2,
              color: "var(--text-body)",
              fontFamily: "inherit",
              transition: "border-color 120ms ease",
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-cyan)", opacity: 0.7, marginBottom: 8, textTransform: "uppercase" }}
            >
              {`// preset`}
            </div>
            <div style={{ fontSize: 16, color: "var(--text-strong)", fontWeight: 500, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, marginBottom: 10 }}>{p.description}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>early={p.earlyTrigBps}bp</span>
              <span>term={p.termTrigBps}bp</span>
              <span>ltv={p.maxLtvPct}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
