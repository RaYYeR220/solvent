/**
 * Five decoration layers behind dashboard/frame content. All absolute-positioned
 * inside a positioned parent. Opacity caps per design spec §3: lines ≤ 0.10,
 * traces ≤ 0.06, grid ≤ 0.025, text labels ≤ 0.30. Content panels must use
 * solid backgrounds — decoration is visible only in margins, gutters, hero-area.
 */
export default function SchematicBackground() {
  return (
    <>
      {/* Atmospheric wash — three radial gradients */}
      <div
        data-layer="atmospheric"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 55% at 50% -5%, rgba(124,213,255,.08) 0%, transparent 55%)," +
            "radial-gradient(ellipse 60% 50% at 100% 100%, rgba(40,80,160,.18) 0%, transparent 60%)," +
            "radial-gradient(ellipse 50% 50% at 0% 100%, rgba(0,0,0,.45) 0%, transparent 60%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Drafting grid (cyan, opacity 0.025 cap) */}
      <div
        data-layer="grid"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(124,213,255,.03) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(124,213,255,.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Intersection dots (opacity 0.18 cap) */}
      <svg
        data-layer="dots"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.18 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="schematic-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="0.6" fill="rgba(124,213,255,.55)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#schematic-dots)" />
      </svg>

      {/* PCB traces (opacity 0.06 cap, NO component labels) */}
      <svg
        data-layer="pcb"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="var(--ink-cyan)" fill="none" strokeWidth="1.2" opacity="0.06">
          <path d="M0,55 L260,55 L260,140 L420,140 L420,210" />
          <circle cx="260" cy="55" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="260" cy="140" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="420" cy="140" r="3.5" fill="var(--ink-cyan)" />
          <path d="M1150,0 L1150,200 L990,200 L990,420 L820,420" />
          <circle cx="1150" cy="200" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="990" cy="200" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="990" cy="420" r="3.5" fill="var(--ink-cyan)" />
          <path d="M0,820 L150,820 L150,720 L460,720 L460,650 L640,650" />
          <circle cx="150" cy="820" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="150" cy="720" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="460" cy="720" r="3.5" fill="var(--ink-cyan)" />
          <path d="M880,900 L880,780 L1080,780 L1080,620 L1200,620" />
          <circle cx="880" cy="780" r="3.5" fill="var(--ink-cyan)" />
          <circle cx="1080" cy="780" r="3.5" fill="var(--ink-cyan)" />
        </g>
      </svg>

      {/* Dimension callouts at top/right edges (lines opacity 0.10, text opacity 0.30) */}
      <svg
        data-layer="dimensions"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="var(--ink-cyan)" fill="none" opacity="0.10" strokeWidth="0.7">
          <line x1="40" y1="14" x2="1160" y2="14" />
          <line x1="40" y1="9" x2="40" y2="19" />
          <line x1="1160" y1="9" x2="1160" y2="19" />
          <line x1="1186" y1="340" x2="1186" y2="540" />
          <line x1="1180" y1="340" x2="1192" y2="340" />
          <line x1="1180" y1="540" x2="1192" y2="540" />
        </g>
        <g fontFamily="var(--font-mono), ui-monospace, monospace" fontSize="9" fill="var(--ink-cyan)" opacity="0.30">
          <text x="600" y="12" textAnchor="middle">DWG-001</text>
          <text x="1185" y="887" textAnchor="end" fontSize="8">REV 2.4.1</text>
        </g>
      </svg>
    </>
  );
}
