import Panel from "./Panel";

interface Card {
  step: string;
  title: string;
  description: string;
}

const CARDS: Card[] = [
  {
    step: "01",
    title: "Signal",
    description:
      "Read Price (DEX) and NAV (Ondo RWADynamicOracle) every tick. Compute divergence in basis points. Cross-check with Pyth/RedStone where available.",
  },
  {
    step: "02",
    title: "Assess",
    description:
      "Classify the regime: CALM (under early_trig), EARLY (between triggers), or TERMINAL (above term_trig). Choose an action bounded by your policy.",
  },
  {
    step: "03",
    title: "Execute",
    description:
      "Bridge to safe-asset via lending or swap. Every decision is signed and posted to an ERC-8004 attestation registry. Verifiable on-chain trace.",
  },
];

export default function HowItWorks() {
  return (
    <section style={{ marginBottom: 60 }}>
      <div
        className="mono"
        style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 16, textTransform: "uppercase" }}
      >
        {`// how_it_works`}
      </div>
      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {CARDS.map((c) => (
          <Panel key={c.step}>
            <div
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--ink-cyan)", opacity: 0.7, marginBottom: 12 }}
            >
              {c.step}&nbsp;&middot;&nbsp;{c.title.toUpperCase()}
            </div>
            <div style={{ fontSize: 22, color: "var(--text-strong)", fontWeight: 300, marginBottom: 10, letterSpacing: "-0.01em" }}>{c.title}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{c.description}</div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
