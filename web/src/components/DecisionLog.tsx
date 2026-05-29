import type { LogEntry } from "../lib/mockData";
import Panel from "./Panel";

interface DecisionLogProps {
  entries: LogEntry[];
  attestationsAttested: number;
  attestationsTotal: number;
}

const REASON_COLOUR: Record<LogEntry["reasonCode"], string> = {
  "park-calm": "var(--ink-cyan-bright)",
  observe: "var(--warm-gold)",
  bridge: "var(--ink-cyan-bright)",
  unwind: "var(--ink-cyan-bright)",
  swap: "var(--ink-cyan-bright)",
};

export default function DecisionLog({ entries, attestationsAttested, attestationsTotal }: DecisionLogProps) {
  return (
    <Panel
      title="// decision_log · last 5"
      meta={`[ ERC-8004  ·  ${attestationsAttested}/${attestationsTotal} attested ]`}
    >
      <div className="mono" style={{ fontSize: 11.5 }}>
        {entries.map((entry, i) => {
          const isObserve = entry.reasonCode === "observe";
          const isLast = i === entries.length - 1;
          return (
            <div
              key={`${entry.timestamp}-${entry.txShort}`}
              data-row={entry.reasonCode}
              style={{
                display: "flex",
                gap: 14,
                padding: "6px 0",
                borderBottom: isLast ? "none" : "1px solid rgba(124,213,255,.08)",
                alignItems: "center",
                ...(isObserve
                  ? {
                      background: "var(--observe-tint)",
                      paddingLeft: 6,
                      marginLeft: -6,
                      paddingRight: 6,
                      marginRight: -6,
                    }
                  : {}),
              }}
            >
              <span style={{ opacity: 0.45, minWidth: 36, paddingLeft: isObserve ? 6 : 0 }}>{entry.timestamp}</span>
              <span style={{ color: REASON_COLOUR[entry.reasonCode], minWidth: 82 }}>{entry.reasonCode}</span>
              <span style={{ color: isObserve ? "var(--warm-gold)" : undefined, opacity: isObserve ? 0.85 : 0.45, flex: 1 }}>
                {"— "}{entry.description}
              </span>
              <span style={{ opacity: 0.4, paddingRight: isObserve ? 6 : 0 }}>{entry.txShort}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
