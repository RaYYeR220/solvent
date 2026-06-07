import Link from "next/link";
import LandingFrame from "@/components/LandingFrame";
import Header from "@/components/Header";
import Scoreboard from "@/components/Scoreboard";
import DepegStoryboard from "@/components/DepegStoryboard";
import HowItWorks from "@/components/HowItWorks";
import TrustModel from "@/components/TrustModel";
import LiveProof, { LiveBadge } from "@/components/LiveProof";
import Footer from "@/components/Footer";
import { headlineScores } from "@/lib/benchmark";
import { loadBenchmark } from "@/lib/benchmark.server";

const RIBBON_STATS = ["24/7 monitoring", "~2s to react", "policy-bounded", "100% on-chain", "non-custodial"];

export default async function LandingPage() {
  const report = await loadBenchmark();
  const scores = headlineScores(report, "terminal-collapse");

  return (
    <LandingFrame>
      <Header ctaHref="/app" ctaLabel="open app →" />

      {/* HERO */}
      <section style={{ marginBottom: 30 }}>
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
        <p className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", opacity: 0.75, maxWidth: 620, marginBottom: 28 }}>
          Running live on USDT0/USDC &middot; Ondo USDY (RWA) integration pending allowlist.
        </p>

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

      {/* STATS RIBBON */}
      <div
        className="mono"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 14,
          padding: "12px 16px",
          marginBottom: 52,
          border: "1px solid var(--border-cyan-faint)",
          borderRadius: 2,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        {RIBBON_STATS.map((s, i) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            {i > 0 && <span style={{ opacity: 0.35 }}>·</span>}
            <span>{s}</span>
          </span>
        ))}
      </div>

      {/* ANATOMY OF A DEPEG (storyboard) */}
      <DepegStoryboard />

      {/* WHEN THE DUST SETTLES (scoreboard payoff) */}
      <section style={{ marginBottom: 56 }}>
        <div
          className="mono"
          style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 14, textTransform: "uppercase" }}
        >
          {`// when_the_dust_settles`}
        </div>
        <h2
          style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.15, margin: "0 0 24px", maxWidth: 680 }}
        >
          On a UST-shape collapse, who&rsquo;s left standing?
        </h2>
        <div style={{ maxWidth: 600, marginBottom: 10 }}>
          <Scoreboard ai={scores.ai} human={scores.human} hodl={scores.hodl} />
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", opacity: 0.6 }}>
          {`// ai-vs-human benchmark · terminal-collapse scenario`}
        </div>
      </section>

      {/* LIVE ON-CHAIN PROOF */}
      <section style={{ marginBottom: 56 }}>
        <div
          className="mono"
          style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 14, textTransform: "uppercase" }}
        >
          {`// not a demo — live right now`}
        </div>
        <LiveProof />
      </section>

      {/* HOW IT WORKS */}
      <HowItWorks />

      {/* TRUST MODEL */}
      <TrustModel />

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
