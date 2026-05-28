interface ScoreboardProps {
  ai: number;
  human: number;
  hodl: number;
}

interface Row {
  id: "ai" | "human" | "hodl";
  who: string;
  verb: string;
  value: string;
  emphasis: "high" | "mid" | "low";
}

function fmtPct(n: number): string {
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

export default function Scoreboard({ ai, human, hodl }: ScoreboardProps) {
  const rows: Row[] = [
    { id: "ai", who: "AI", verb: "saved", value: fmtPct(ai), emphasis: "high" },
    { id: "human", who: "Human", verb: "kept", value: fmtPct(human), emphasis: "mid" },
    { id: "hodl", who: "HODL", verb: "rode to", value: fmtPct(hodl), emphasis: "low" },
  ];

  const colourFor = (e: Row["emphasis"]): string =>
    e === "high" ? "var(--ink-cyan)" : e === "mid" ? "var(--text-strong)" : "var(--warm-gold)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        <div
          key={r.id}
          data-row={r.id}
          className="mono"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            fontSize: 18,
            color: "var(--text-body)",
            borderBottom: "1px solid var(--border-cyan-faint)",
            paddingBottom: 12,
          }}
        >
          <span style={{ minWidth: 80, color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>{r.who}</span>
          <span style={{ flex: 1, color: "var(--text-muted)", fontSize: 13 }}>&middot; {r.verb} &middot;</span>
          <span
            data-value
            style={{
              color: colourFor(r.emphasis),
              fontSize: 28,
              fontWeight: 300,
              letterSpacing: "-0.01em",
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
