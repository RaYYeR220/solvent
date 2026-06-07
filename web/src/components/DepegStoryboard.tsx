import Panel from "./Panel";

type Tone = "calm" | "exit" | "warn" | "crash";

interface Frame {
  t: string;
  price: string;
  /** bar fill %, faithful to the price (peg = 100). */
  pct: number;
  scene: string;
  tone: Tone;
}

// Illustrative beats of a UST-shape terminal collapse. The early move is
// deliberately subtle — that's the whole thesis: by the time a depeg is
// obvious, the exit is gone. Solvent leaves at T+8h while the bar still looks
// almost full.
const FRAMES: Frame[] = [
  { t: "T+0h",  price: "$1.000", pct: 100, tone: "calm",  scene: "Peg holds. Nothing on the chart looks wrong." },
  { t: "T+8h",  price: "$0.985", pct: 92,  tone: "exit",  scene: "First wobble. The forums call it FUD." },
  { t: "T+20h", price: "$0.92",  pct: 64,  tone: "warn",  scene: "Humans wake up. “Is this actually real?”" },
  { t: "T+44h", price: "$0.64",  pct: 34,  tone: "crash", scene: "Panic. Exit liquidity has evaporated." },
  { t: "T+72h", price: "$0.10",  pct: 10,  tone: "crash", scene: "$40B erased. Far too late to leave." },
];

function toneColor(tone: Tone): string {
  switch (tone) {
    case "calm":  return "var(--ink-cyan)";
    case "exit":  return "var(--ink-cyan-bright)";
    case "warn":  return "var(--warm-gold)";
    case "crash": return "var(--warm-gold)";
  }
}

const BAR_TRACK_H = 92;

function StoryFrame({ frame }: { frame: Frame }) {
  const isExit = frame.tone === "exit";
  const color = toneColor(frame.tone);
  const fillOpacity = frame.tone === "crash" ? 0.9 : frame.tone === "warn" ? 0.6 : 0.85;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 14px 16px",
        border: isExit ? "1px solid var(--ink-cyan)" : "1px solid var(--border-cyan-faint)",
        borderRadius: 2,
        background: isExit ? "rgba(124,213,255,.05)" : "transparent",
        boxShadow: isExit ? "0 0 18px rgba(124,213,255,.18)" : "none",
        position: "relative",
      }}
    >
      {isExit && (
        <div
          className="mono"
          style={{
            position: "absolute",
            top: -10,
            left: 12,
            background: "var(--ink-cyan)",
            color: "var(--bg-base)",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "3px 8px",
            borderRadius: 2,
            textTransform: "uppercase",
          }}
        >
          ▸ Solvent exits
        </div>
      )}

      {/* falling bar */}
      <div
        style={{
          height: BAR_TRACK_H,
          position: "relative",
          borderBottom: "1px solid var(--border-cyan-faint)",
          marginTop: isExit ? 8 : 0,
        }}
        aria-hidden
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${frame.pct}%`,
            background: color,
            opacity: fillOpacity,
            borderRadius: "2px 2px 0 0",
          }}
        />
      </div>

      <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        {frame.t}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 300, color, letterSpacing: "-0.01em" }}>
        {frame.price}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {frame.scene}
      </div>
    </div>
  );
}

export default function DepegStoryboard() {
  return (
    <section style={{ marginBottom: 56 }}>
      <div
        className="mono"
        style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 14, textTransform: "uppercase" }}
      >
        {`// anatomy_of_a_depeg`}
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
        By the time a depeg is obvious, the exit is already gone.
      </h2>

      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {FRAMES.map((f) => (
          <StoryFrame key={f.t} frame={f} />
        ))}
      </div>

      {/* contrast outcomes */}
      <div
        className="reflow-grid mono"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}
      >
        <div style={{ padding: "12px 16px", border: "1px solid var(--border-cyan)", borderRadius: 2, fontSize: 13 }}>
          <span style={{ color: "var(--ink-cyan)" }}>Solvent</span>
          <span style={{ color: "var(--text-muted)" }}> exited at $0.985 — </span>
          <span style={{ color: "var(--ink-cyan-bright)" }}>down 1.5%</span>
        </div>
        <div style={{ padding: "12px 16px", border: "1px solid var(--border-cyan-faint)", borderRadius: 2, fontSize: 13 }}>
          <span style={{ color: "var(--warm-gold)" }}>HODL</span>
          <span style={{ color: "var(--text-muted)" }}> rode it to $0.10 — </span>
          <span style={{ color: "var(--warm-gold)" }}>down 90%</span>
        </div>
      </div>

      <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", opacity: 0.6, marginTop: 12 }}>
        {`// illustrative timeline · modeled on the May 2022 UST collapse (~$40B erased in 72h)`}
      </div>
    </section>
  );
}
