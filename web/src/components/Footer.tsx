interface FooterProps {
  revision: string;
  drawingId: string;
  network: string;
}

export default function Footer({ revision, drawingId, network }: FooterProps) {
  return (
    <div
      className="mono"
      style={{
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: "var(--text-muted)",
        marginTop: 22,
        paddingTop: 14,
        borderTop: "1px solid rgba(124,213,255,.12)",
        textTransform: "uppercase",
      }}
    >
      <span>solvent · depeg guardian · {drawingId.toLowerCase()} · rev {revision.replace(/^v/, "")}</span>
      <span>scale 1:1 · {network.toLowerCase()} net</span>
      <span style={{ color: "var(--ink-cyan)" }}>verified ● erc-8004</span>
    </div>
  );
}
