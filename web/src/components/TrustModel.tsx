import Panel from "./Panel";

interface Node {
  step: string;
  title: string;
  body: string;
  /** connector verb shown under the node (not on the last one). */
  emits?: string;
}

const NODES: Node[] = [
  {
    step: "01",
    title: "Agent",
    body: "Off-chain brain. Reads market price against NAV, classifies the regime, picks an action. Holds no keys to your funds.",
    emits: "signs →",
  },
  {
    step: "02",
    title: "Vault · action surface",
    body: "On-chain and policy-bounded. The agent can only call pre-approved actions — swap to the safe asset. It can never withdraw or move user funds.",
    emits: "emits →",
  },
  {
    step: "03",
    title: "ERC-8004 attestation",
    body: "Every decision is signed and recorded on-chain. Anyone can replay exactly what the agent did, with what signals, and when.",
  },
];

export default function TrustModel() {
  return (
    <section style={{ marginBottom: 56 }}>
      <div
        className="mono"
        style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 14, textTransform: "uppercase" }}
      >
        {`// trust_model`}
      </div>
      <h2
        style={{
          fontSize: 30,
          fontWeight: 300,
          letterSpacing: "-0.01em",
          color: "var(--text-strong)",
          lineHeight: 1.15,
          margin: "0 0 24px",
          maxWidth: 680,
        }}
      >
        Why it&rsquo;s safe to let an agent drive.
      </h2>

      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, alignItems: "stretch" }}>
        {NODES.map((n) => (
          <Panel key={n.step} style={{ display: "flex", flexDirection: "column" }}>
            <div
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--ink-cyan)", opacity: 0.7, marginBottom: 12 }}
            >
              {n.step}&nbsp;&middot;&nbsp;{n.title.toUpperCase()}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, flex: 1 }}>{n.body}</div>
            {n.emits && (
              <div
                className="mono"
                style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--ink-cyan)", opacity: 0.8, marginTop: 14, textTransform: "uppercase" }}
              >
                {n.emits}
              </div>
            )}
          </Panel>
        ))}
      </div>

      <div
        className="mono"
        style={{
          marginTop: 16,
          padding: "12px 16px",
          border: "1px solid var(--border-cyan-faint)",
          borderRadius: 2,
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: "var(--ink-cyan)" }}>Non-custodial by construction.</span>{" "}
        Withdrawals are share-gated · the kill-switch is owner-only · the agent touches a fixed action
        surface, nothing else. Even the deployer can&rsquo;t move your funds.
      </div>
    </section>
  );
}
