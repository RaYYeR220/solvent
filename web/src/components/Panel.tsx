import type { CSSProperties, ReactNode } from "react";

interface PanelProps {
  title?: string;
  meta?: string;
  children: ReactNode;
  style?: CSSProperties;
}

const cornerBase: CSSProperties = {
  position: "absolute",
  width: 10,
  height: 10,
  opacity: 0.7,
};

export default function Panel({ title, meta, children, style }: PanelProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border-cyan)",
        background: "var(--bg-panel)",
        padding: 18,
        position: "relative",
        borderRadius: 2,
        ...style,
      }}
    >
      <span data-corner="tl" style={{ ...cornerBase, top: -2, left: -2, borderTop: "2px solid var(--ink-cyan)", borderLeft: "2px solid var(--ink-cyan)" }} />
      <span data-corner="tr" style={{ ...cornerBase, top: -2, right: -2, borderTop: "2px solid var(--ink-cyan)", borderRight: "2px solid var(--ink-cyan)" }} />
      <span data-corner="bl" style={{ ...cornerBase, bottom: -2, left: -2, borderBottom: "2px solid var(--ink-cyan)", borderLeft: "2px solid var(--ink-cyan)" }} />
      <span data-corner="br" style={{ ...cornerBase, bottom: -2, right: -2, borderBottom: "2px solid var(--ink-cyan)", borderRight: "2px solid var(--ink-cyan)" }} />

      {(title || meta) && (
        <div
          className="mono"
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            color: "var(--ink-cyan)",
            opacity: 0.7,
            marginBottom: 12,
          }}
        >
          {title && <span>{title}</span>}
          {meta && <span style={{ color: "var(--text-muted)" }}>{meta}</span>}
        </div>
      )}

      {children}
    </div>
  );
}
