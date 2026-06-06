import Link from "next/link";
import LandingFrame from "@/components/LandingFrame";
import Header from "@/components/Header";
import Scoreboard from "@/components/Scoreboard";
import HowItWorks from "@/components/HowItWorks";
import LiveProof, { LiveBadge } from "@/components/LiveProof";
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
      <section style={{ marginBottom: 64 }}>
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
            margin: "0 0 20px",
            maxWidth: 820,
          }}
        >
          Depeg is fast.<br />Humans aren&rsquo;t.
        </h1>

        <div style={{ marginBottom: 22 }}>
          <LiveBadge />
        </div>

        <p style={{ fontSize: 16, color: "var(--text-body)", maxWidth: 620, lineHeight: 1.5, margin: "0 0 7px" }}>
          An autonomous agent guarding on-chain deposits from depeg &mdash; watching
          price-vs-NAV around the clock and exiting to a safe asset before humans can react.
        </p>
        <p className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", opacity: 0.75, maxWidth: 620, marginBottom: 30 }}>
          Running live on USDT0/USDC &middot; Ondo USDY (RWA) integration pending allowlist.
        </p>

        <p className="mono" style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 14 }}>
          On a UST-shape collapse:
        </p>
        <div style={{ maxWidth: 600, marginBottom: 10 }}>
          <Scoreboard ai={scores.ai} human={scores.human} hodl={scores.hodl} />
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", opacity: 0.6, marginBottom: 30 }}>
          {`// ai-vs-human benchmark · terminal-collapse scenario`}
        </div>

        <Link
          href="/app"
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
          open the live dashboard →
        </Link>
      </section>

      {/* SECTION DIVIDER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(124,213,255,.27))" }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.65, textTransform: "uppercase" }}>
          section B  ·  live proof
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(124,213,255,.27))" }} />
      </div>

      {/* LIVE ON-CHAIN PROOF */}
      <section style={{ marginBottom: 56 }}>
        <LiveProof />
      </section>

      {/* HOW IT WORKS */}
      <HowItWorks />

      {/* CTA */}
      <section style={{ textAlign: "center", padding: "40px 0 20px" }}>
        <div
          style={{ fontSize: 28, fontWeight: 300, color: "var(--text-strong)", letterSpacing: "-0.01em", marginBottom: 16 }}
        >
          Deposit USDT0. Solvent watches the rest.
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

      <Footer revision="v2.5.0" drawingId="DWG-001" network="MANTLE" />
    </LandingFrame>
  );
}
