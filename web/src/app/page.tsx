import Link from "next/link";
import LandingFrame from "@/components/LandingFrame";
import Header from "@/components/Header";
import Scoreboard from "@/components/Scoreboard";
import HowItWorks from "@/components/HowItWorks";
import BenchmarkReplay from "@/components/BenchmarkReplay";
import Footer from "@/components/Footer";
import { headlineScores } from "@/lib/benchmark";
import { loadBenchmark } from "@/lib/benchmark.server";

export default async function LandingPage() {
  const report = await loadBenchmark();
  const scores = headlineScores(report, "terminal-collapse");

  return (
    <LandingFrame>
      <Header ctaHref="/app" ctaLabel="open app →" />

      {/* HERO */}
      <section style={{ marginBottom: 72 }}>
        <div
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-cyan)", opacity: 0.7, marginBottom: 18, textTransform: "uppercase" }}
        >
          {`// depeg.guardian · track 3 · ai × rwa`}
        </div>
        <h1
          className="reflow-hero"
          style={{
            fontSize: 64,
            fontWeight: 300,
            letterSpacing: "-0.015em",
            color: "var(--text-strong)",
            lineHeight: 1.05,
            margin: "0 0 18px",
            maxWidth: 820,
          }}
        >
          Depeg is fast.<br />Humans aren&rsquo;t.
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-muted)", maxWidth: 600, marginBottom: 28 }}>
          On a UST-shape collapse:
        </p>

        <div style={{ maxWidth: 600, marginBottom: 32 }}>
          <Scoreboard ai={scores.ai} human={scores.human} hodl={scores.hodl} />
        </div>

        <Link
          href="#replay"
          className="mono"
          style={{
            display: "inline-block",
            background: "var(--ink-cyan)",
            color: "var(--bg-base)",
            padding: "12px 24px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          ▶ watch the replay
        </Link>
      </section>

      {/* SECTION DIVIDER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          section B  ·  evidence
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      {/* BENCHMARK REPLAY */}
      <section id="replay" style={{ marginBottom: 56 }}>
        <BenchmarkReplay />
      </section>

      {/* HOW IT WORKS */}
      <HowItWorks />

      {/* CTA */}
      <section style={{ textAlign: "center", padding: "40px 0 20px" }}>
        <div
          style={{ fontSize: 28, fontWeight: 300, color: "var(--text-strong)", letterSpacing: "-0.01em", marginBottom: 16 }}
        >
          Deposit USDY. Solvent watches the rest.
        </div>
        <Link
          href="/app"
          className="mono"
          style={{
            display: "inline-block",
            border: "1px solid var(--ink-cyan)",
            color: "var(--ink-cyan)",
            padding: "12px 28px",
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          open app →
        </Link>
      </section>

      <Footer revision="v2.4.1" drawingId="DWG-001" network="MANTLE" />
    </LandingFrame>
  );
}
