import type { PolicyView } from "../lib/mockData";
import Panel from "./Panel";

interface PolicyPanelProps {
  policy: PolicyView;
}

interface Row {
  label: string;
  value: string;
  color: string; // CSS var
}

function buildRows(p: PolicyView): Row[] {
  return [
    { label: "early_trig", value: `${p.earlyTrigBps} bps`, color: "var(--ink-cyan-bright)" },
    { label: "term_trig", value: `${p.termTrigBps} bps`, color: "var(--ink-cyan-bright)" },
    { label: "max_ltv", value: `${p.maxLtvPct}%`, color: "var(--text-strong)" },
    { label: "safe_asset", value: p.safeAsset, color: "var(--ink-cyan)" },
    { label: "slippage_cap", value: `${p.slippageCapBps} bps`, color: "var(--text-strong)" },
  ];
}

export default function PolicyPanel({ policy }: PolicyPanelProps) {
  const rows = buildRows(policy);
  return (
    <Panel title="// policy_reg" meta="[ CFG ]">
      <div
        className="mono"
        style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11.5 }}
      >
        {rows.map((row, i) => (
          <div key={row.label}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span style={{ color: row.color }}>{row.value}</span>
            </div>
            {i < rows.length - 1 && (
              <div style={{ height: 1, background: "rgba(124,213,255,.1)", marginTop: 10 }} />
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
