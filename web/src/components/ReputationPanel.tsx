"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import Panel from "./Panel";
import { useReputation, type ReputationEntry } from "../lib/hooks/useReputation";
import { useGiveFeedback } from "../lib/hooks/useGiveFeedback";

// ---------- style atoms (Schematic-Blueprint) ----------

const inputStyle: React.CSSProperties = {
  background: "rgba(124,213,255,.04)",
  border: "1px solid rgba(124,213,255,.25)",
  color: "var(--text-strong)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 13,
  width: "100%",
  outline: "none",
  borderRadius: 2,
};

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "transparent" : "var(--ink-cyan)",
  border: "1px solid var(--ink-cyan)",
  color: disabled ? "var(--ink-cyan)" : "var(--bg-deep, #0a1932)",
  padding: "12px 16px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  borderRadius: 2,
  opacity: disabled ? 0.4 : 1,
  width: "100%",
});

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.14em",
  color: "var(--ink-cyan)",
  opacity: 0.75,
  textTransform: "lowercase",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.14em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

// ---------- helpers ----------

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** ★ filled + ☆ empty out of 5, rounded to the nearest whole star. */
function starString(value: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/** Decode the optional comment from a `data:application/json,<encoded>` URI.
 *  Synchronous + try/catch so the ratings list needs no per-row hooks. */
function commentFromUri(uri: string): string | undefined {
  if (!uri.startsWith("data:application/json,")) return undefined;
  try {
    const raw = uri.split(",").slice(1).join(",");
    const payload = JSON.parse(decodeURIComponent(raw)) as { comment?: string };
    const c = payload.comment?.trim();
    return c && c.length > 0 ? c : undefined;
  } catch {
    return undefined;
  }
}

// ---------- rate form ----------

function RateForm() {
  const gf = useGiveFeedback();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  // Disconnected — prompt to connect.
  if (!gf.canRate && !gf.isOwner) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          connect a wallet to rate the guardian
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button
              type="button"
              onClick={show}
              style={{ ...primaryBtnStyle(false), width: "auto", padding: "10px 22px", alignSelf: "flex-start" }}
            >
              [ connect wallet ]
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  // Connected as the agent owner — can't self-rate.
  if (gf.isOwner) {
    return (
      <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", opacity: 0.85 }}>
        agents can&apos;t rate themselves (ERC-8004 self-feedback guard)
      </div>
    );
  }

  // Can rate.
  let label = "RATE";
  let disabled = stars === 0;
  if (gf.state === "submitting") { label = "SUBMITTING…"; disabled = true; }
  else if (gf.state === "done") { label = "RATED ✓"; disabled = true; }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* star selector */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }} aria-label="star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 22,
              lineHeight: 1,
              color: n <= stars ? "var(--warm-gold)" : "var(--text-muted)",
              opacity: n <= stars ? 1 : 0.45,
            }}
          >
            {n <= stars ? "★" : "☆"}
          </button>
        ))}
      </div>

      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="optional — how did the guardian do?"
        disabled={gf.state === "submitting"}
        style={inputStyle}
        aria-label="rating comment"
      />

      <button
        type="button"
        onClick={() => gf.rate(stars, comment)}
        disabled={disabled}
        style={primaryBtnStyle(disabled)}
      >
        {label}
      </button>

      {gf.error && (
        <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
          error: {gf.error}
        </div>
      )}
    </div>
  );
}

// ---------- ratings list ----------

function RatingRow({ entry, isLast }: { entry: ReputationEntry; isLast: boolean }) {
  const comment = commentFromUri(entry.uri);
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "7px 0",
        borderBottom: isLast ? "none" : "1px solid rgba(124,213,255,.08)",
        alignItems: "center",
      }}
    >
      <span style={{ color: "var(--warm-gold)", minWidth: 72, fontSize: 12, letterSpacing: "0.05em" }}>
        {starString(entry.stars)}
      </span>
      <span style={{ color: "var(--ink-cyan)", opacity: 0.85, minWidth: 110 }} title={entry.client}>
        {shortAddr(entry.client)}
      </span>
      <span style={{ opacity: comment ? 0.8 : 0.4, flex: 1, color: comment ? "var(--text-strong)" : undefined }}>
        {comment ? `— ${comment}` : "—"}
      </span>
    </div>
  );
}

// ---------- component ----------

const colStyle = (withRule: boolean): React.CSSProperties => ({
  ...(withRule
    ? { borderLeft: "1px solid rgba(124,213,255,.1)", paddingLeft: 28 }
    : {}),
});

export default function ReputationPanel() {
  const rep = useReputation();
  const recent = rep.entries.slice(0, 5);

  return (
    <Panel title="// reputation" meta="[ ERC-8004 · depositor feedback ]">
      <div
        className="reflow-grid"
        style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr 1.5fr", gap: 28, alignItems: "stretch" }}
      >
        {/* ---- col 1: guardian score ---- */}
        <div>
          <div className="mono" style={sectionTitleStyle}>{"// guardian_score"}</div>
          {rep.count > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono" style={{ fontSize: 24, color: "var(--warm-gold)", letterSpacing: "0.06em" }}>
                {starString(rep.averageStars)}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="mono" style={{ fontSize: 30, fontWeight: 300, color: "var(--text-strong)" }}>
                  {rep.averageStars.toFixed(1)}
                </span>
                <span className="mono" style={{ ...labelStyle, fontSize: 11 }}>/ 5</span>
              </div>
              <span className="mono" style={{ ...labelStyle, fontSize: 11 }}>
                {rep.count} {rep.count === 1 ? "rating" : "ratings"}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="mono" style={{ fontSize: 24, color: "var(--text-muted)", opacity: 0.5, letterSpacing: "0.06em" }}>
                ☆☆☆☆☆
              </span>
              <span className="mono" style={{ fontSize: 13, color: "var(--text-muted)" }}>no ratings yet</span>
            </div>
          )}
        </div>

        {/* ---- col 2: rate form ---- */}
        <div style={colStyle(true)}>
          <div className="mono" style={sectionTitleStyle}>{"// rate the guardian"}</div>
          <RateForm />
        </div>

        {/* ---- col 3: recent ratings ---- */}
        <div style={colStyle(true)}>
          <div className="mono" style={sectionTitleStyle}>{"// recent ratings"}</div>
          {recent.length === 0 ? (
            <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.7 }}>
              {"// no ratings yet · be the first depositor to rate the guardian"}
            </div>
          ) : (
            <div className="mono" style={{ fontSize: 11.5 }}>
              {recent.map((entry, i) => (
                <RatingRow
                  key={entry.txHash || i}
                  entry={entry}
                  isLast={i === recent.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
