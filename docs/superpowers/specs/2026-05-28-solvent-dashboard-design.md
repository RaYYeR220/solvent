# Solvent Dashboard — Visual & UX Design Spec

**Design spec** · 2026-05-28 · Status: approved, pre-implementation
**Parent project:** Solvent (Mantle Turing Test hackathon, Track 3 AI×RWA) — see `docs/superpowers/specs/2026-05-27-solvent-design.md`
**Brainstorm session:** `.superpowers/brainstorm/1884-1779993188/` (40+ mockups surveyed)
**Canonical visual reference:** `docs/superpowers/specs/2026-05-28-solvent-dashboard-mockup.html`

---

## 1. One-paragraph summary

Solvent's user-facing surface is a **hybrid landing-page + product app**. The landing tells the Human-vs-AI story (Track 3 demo / Best-UI/UX target), the app is the real depositor view (connect → preset → deposit → live monitor). Visual identity = **"Schematic Blueprint"**: deep blueprint navy + cyan ink + pale ice, with quiet PCB-trace decoration and dimension callouts as background atmosphere. Bento layout (M01 structure) inside each main view. UI panels are solid-bg and clearly distinct from the decorative background so the interface always reads first.

## 2. Positioning

**Hybrid landing + app:**
- `/` (landing) — polished single page, hero scoreboard, benchmark replay, attestation log preview, "Open app" CTA
- `/app` (product) — wallet connect → policy preset → deposit → live monitor + decision log

One coherent visual identity across both. Landing is the prize-targeting surface; app is the credibility/integration surface.

## 3. Visual identity — Schematic Blueprint (LOCKED)

### Lineage (what fed this decision)
M01 bento layout + M50 isometric blueprint feel + M58 PCB-trace decoration (recoloured away from cyan-green to avoid Hyperliquid association) + M23 tech-noir atmospheric mood, finally synthesised in M50's blue palette.

### Palette (LOCKED — use these hex values verbatim)

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#0a1932` | Frame background |
| `--bg-panel` | `#0e1d3a` | Panel solid background (NEVER transparent) |
| `--ink-cyan` | `#7cd5ff` | Primary accent — borders, labels, brand mark, regime pill, hero number |
| `--ink-cyan-bright` | `#a8e0ff` | Brighter cyan — chart line, log "calm" entries, secondary values |
| `--text-body` | `#c8d8f0` | Body text (mid-cool ivory) |
| `--text-strong` | `#e0eaf8` | Stronger body / important values |
| `--text-muted` | `#6a8aa8` | Labels, secondary, muted timestamps |
| `--warm-gold` | `#e8c060` | The ONE warm accent — used only on "observe / watch" log entries and spread `−2 bp` for visual relief |
| `--border-cyan` | `rgba(124,213,255,.28)` | Panel borders (1px) |
| `--corner-cyan` | `#7cd5ff` at opacity 0.7 | IC-style corner notches on panels (2px L-marks at 4 corners) |

### Typography (LOCKED)

- **Hero / body:** `Inter, system-ui, -apple-system, sans-serif`
  - Hero number: `font-weight: 300` (light), `font-size: 58px`, `letter-spacing: -0.01em`
  - Brand mark "SOLVENT": `font-weight: 500`, `letter-spacing: 0.08em`
  - Body: `font-weight: 400`, `font-size: 13–14px`
- **Data / labels / annotations:** `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`
  - Used for: log entries, policy field values, status pills, dimension callouts, footer drafting stamp, all numeric data
  - Hierarchy via opacity (0.45–0.7) rather than size

### Layout — M01 bento (LOCKED)

Four rows inside the main frame:

1. **Header strip** — brand mark + name (left) | regime pill + asset/network + truncated address + revision (right). 32px brand-mark SVG (compass-in-frame).
2. **Section divider** — thin cyan gradient hairlines with a small uppercased mono label `SECTION A · MAIN VIEW` centred.
3. **Hero stat** — `// protected_position` label (mono, muted), `$98,540` huge (cyan, light-weight, 58px), sub-meta line (`982.04 USDY · entry $100,000 · Δ +0.0%`), status pills row (live, regime, divergence, tick, attest).
4. **2-col panel row** — chart panel (~60%) + policy panel (~40%), 14px gap.
5. **Full-width decision log panel** — 5 entries; one amber-tinted row for "observe" with a soft background highlight.
6. **Footer drafting stamp** — mono caps, low opacity, three slots: revision / scale / verification.

All panels (chart, policy, log) carry:
- `background: #0e1d3a` (solid, NEVER transparent)
- `border: 1px solid rgba(124,213,255,.28)`
- IC-style corner notches at 4 corners (2px L-marks, cyan, opacity 0.7)
- Internal padding 18px

### Background decoration (LOCKED — strict opacity caps)

Five layered atmospheric elements, all `position:absolute; inset:0; pointer-events:none; z-index:0`, behind the content. Content panels sit above with solid backgrounds, so decoration is visible only in the hero region, margins, and gutters.

| Layer | Treatment | Opacity cap |
|---|---|---|
| Atmospheric wash | Three radial gradients: cool blue glow top-centre, navy-blue tint bottom-right, dark vignette bottom-left | n/a (mood) |
| Drafting grid | CSS `background-image` 1px lines every 32px in cyan | **0.025** |
| Intersection dots | SVG `<pattern>`, 0.6px circles at grid intersections | **0.18** overall |
| PCB traces | SVG paths routed around the frame edges with 3.5px via-circles at corners; cyan; **NO component labels** (U12 / R7 / etc.) | **0.06** |
| Dimension callouts | SVG dimension lines + endpoint ticks at the very top edge (`W = DWG-001`) and right edge (`H`); mono labels at top-centre and bottom-right corner (`REV 2.4.1`) | **0.10** (lines) / **0.30** (text) |

### UI clarity principles (LOCKED — these are non-negotiable, learned from v1 vs v2)

1. **Content is opaque, decoration is quiet.** Panel backgrounds MUST be solid `#0e1d3a` — never `rgba(0,0,0,X)` transparent. Decoration shows through only in margins/gutters/hero-area, never through content panels.
2. **No decorative element inside content area.** No inline `↗ balance_node` callouts next to the hero number, no component labels (`R7`, `U12`) floating near panels. Decoration lives in the frame margins and behind the hero strip only.
3. **Decoration opacity caps:** lines ≤ 0.10, traces ≤ 0.06, grid ≤ 0.025, text labels ≤ 0.30. Never higher.
4. **The interface always reads first.** When the user lands on the dashboard, the eye should go straight to `$98,540`, then the regime pill, then the chart, then the log. The schematic atmosphere is supportive texture, never competing.

## 4. Information architecture

### `/` landing page

Single-scroll narrative, sections in this order:

1. **Header** — Solvent mark + name (left) | "Open app →" CTA (right)
2. **Hero** — V4 narrative shape (decided in brainstorming):
   - Headline: *"Depeg is fast. Humans aren't."*
   - Body: *"On a UST-shape collapse:"*
   - Three score lines:
     - AI · saved · **98.5%**
     - Human · kept · 78%
     - HODL · rode to · 10%
   - Primary CTA: `[ ▶ Watch the replay ]`
3. **Benchmark replay** — interactive playback (Plan 3 already produces `benchmark-report.json`; this section visualises it with a scrubber)
4. **Decision log preview** — last N entries with reason codes, sample of the on-chain ERC-8004 trace
5. **How it works** — 3 cards (signal → assess → execute) with mechanism diagram
6. **ERC-8004 attestation log** — verifiability proof (link to Mantle explorer)
7. **CTA / open app** — final "Try it" button

### `/app` dashboard

The reference mockup is `docs/superpowers/specs/2026-05-28-solvent-dashboard-mockup.html`. Bento structure as in §3, populated with:
- Header (brand + regime + asset + address)
- Hero `$98,540` protected position
- 2-col: Price↔NAV chart + Policy panel
- Decision log (5 entries, one observe)
- Footer drafting stamp

Pre-deposit, this same page hosts the onboarding flow:
- **Empty state:** "Connect wallet to begin" → wallet modal
- **Post-connect, pre-deposit:** policy preset picker (Aggressive / Balanced / Terminal-only) + deposit amount input + deposit button
- **Post-deposit:** the full dashboard as in the mockup

## 5. Component inventory

`web/src/components/`:
- `BrandMark.tsx` — the 32px SVG compass-in-frame logo
- `SchematicBackground.tsx` — the 5 decoration layers (grid, dots, traces, dimensions, atmospheric wash) as one composable backdrop component
- `Panel.tsx` — solid-bg panel with IC corner notches, title slot, content slot
- `HeroStat.tsx` — protected position with label / number / meta / status-pills row
- `ChartPanel.tsx` — Price↔NAV SVG line chart (inline SVG, no library)
- `PolicyPanel.tsx` — policy fields list with hairline dividers
- `DecisionLog.tsx` — 5-entry table; amber-highlighted observe row
- `Footer.tsx` — drafting stamp (revision / scale / verification)
- `Header.tsx` — landing/dashboard header (brand + nav/CTA)
- `Scoreboard.tsx` — Human-vs-AI 3-score block (landing)
- `BenchmarkReplay.tsx` — chart + scrubber for the Plan 3 benchmark data
- `HowItWorks.tsx` — 3-card mechanism explainer (landing)
- `OnboardingFlow.tsx` — connect → preset → deposit wizard (in-app pre-deposit state)
- `PresetPicker.tsx` — Aggressive / Balanced / Terminal-only cards

`web/src/lib/`:
- `mockData.ts` — static vault state for `/app` (Plan 4) — replaced by viem reads in integration phase
- `benchmark.ts` — reader for `benchmark-report.json`

## 6. Data layer

Plan 4 ships with everything mocked. The integration phase replaces mock with real on-chain reads.

| Surface | Plan 4 (mock) | Integration phase (real) |
|---|---|---|
| Benchmark scoreboard | Copy/import `agent/benchmark-report.json` (Plan 3 generates this) | Same — already deterministic |
| Vault state ($98,540, USDY balance, regime) | Static fixture `lib/mockData.ts` | `viem` reads against deployed SolventVault on Mantle |
| Decision log entries | Fixture array (matches the mockup data) | Reads from SolventAttestation contract + Mantle explorer for tx hashes |
| Wallet connect / address | Mocked address `0x7a4f…e1b3`; "connect" button is non-functional shell | RainbowKit / wagmi + viem |
| Deposit flow | Mocked: preset selection + amount input updates fixture state | Real ERC-20 approval + `SolventVault.deposit()` tx |
| Live chart (Price↔NAV) | Static SVG path from the mockup | Live data from Ondo `RWADynamicOracle` + DEX |

## 7. Tech stack (LOCKED)

- **Next.js** (App Router, TypeScript, strict mode)
- **Tailwind CSS** — palette tokens above wired into `tailwind.config.ts` as theme extensions
- **Inter** + **JetBrains Mono** via `next/font/google`
- **Charts** — inline SVG (no chart library); the mockup HTML already contains the canonical SVG paths to copy
- **State** — React state + `useState`/`useReducer`; no global store needed for MVP
- **Routing** — `app/page.tsx` (landing), `app/app/page.tsx` (dashboard); both under one Next app
- **Wallet (integration phase)** — RainbowKit + wagmi + viem (deferred)
- **Linting** — ESLint with Next defaults; `npm run lint` and `npm run build` must pass

Location: new top-level directory `web/` (parallel to `contracts/` and `agent/`).

## 8. Scope

### MVP (Plan 4 deliverable)
- `web/` Next.js app, deployable as a static export
- `/` landing with all sections in §4 (hero + scoreboard + replay placeholder + how-it-works + CTA)
- `/app` dashboard with full bento view (header + hero stat + chart + policy + log + footer), driven by mock fixtures matching the canonical mockup
- Onboarding wizard (connect → preset → deposit) using mock state — visually complete, non-functional auth
- Benchmark scoreboard sourced from `benchmark-report.json` (copy from `agent/` at build time or commit a snapshot to `web/public/`)
- Schematic-Blueprint visual identity applied throughout (palette, typography, decoration rules)
- `npm run build` clean, `npm run lint` clean
- Hosted demo URL (Vercel / GitHub Pages / Mantle community deploy — TBD operationally)

### Stretch
- Benchmark **replay scrubber** — interactive playback through the decision log
- Real wallet connect (wagmi + viem), still against mock vault data — so a depositor can preview wallet flow without on-chain commitment
- Dark/light mode toggle (default dark, light-mode variant could use M05 editorial palette as fallback)
- Mobile responsive polish (mockup is desktop-first; landing should reflow gracefully, dashboard simplifies to single column)

### Out of scope (deferred to integration phase)
- Live on-chain reads (viem against Mantle)
- Real `SolventVault.deposit()` transactions
- Real ERC-8004 attestation queries
- Multi-user features
- Authentication beyond wallet connect

## 9. Build order (TDD where reasonable, but mostly visual)

1. Scaffold `web/` (`create-next-app`, configure Tailwind, install fonts, set palette tokens in `tailwind.config.ts`).
2. Static assets: copy `agent/benchmark-report.json` to `web/public/`.
3. `SchematicBackground` component (the 5 layers; this is the visual signature — get it right first, snapshot test if useful).
4. `Panel` primitive with IC corner notches and solid bg; verify against mockup.
5. Mock fixtures (`lib/mockData.ts`, `lib/benchmark.ts`).
6. `/app` dashboard page: assemble Panel + HeroStat + ChartPanel + PolicyPanel + DecisionLog + Footer, populate from fixtures.
7. Onboarding wizard (`OnboardingFlow`, `PresetPicker`) wired to local component state.
8. `/` landing page: Header + Hero (V4 shape) + Scoreboard (reads benchmark JSON) + HowItWorks + CTA. Replay scrubber stub.
9. Cross-page navigation, link from landing CTA to `/app`.
10. Final pass: typography hierarchy, spacing, mobile reflow, lint + build.

(Stretch) Real benchmark replay scrubber with playback animation. (Stretch) wagmi/viem wallet connect (mock vault).

## 10. References

- **Canonical mockup:** `docs/superpowers/specs/2026-05-28-solvent-dashboard-mockup.html` — the chosen "Schematic Blueprint" rendering. Open in a browser for the visual source-of-truth.
- **Parent design spec:** `docs/superpowers/specs/2026-05-27-solvent-design.md` — full Solvent product spec.
- **Plan 3 output:** `agent/src/benchmark/index.ts` produces `benchmark-report.json` with the AI-vs-Human scoreboard data the dashboard consumes.
- **Brainstorm session:** `.superpowers/brainstorm/1884-1779993188/content/` — full mockup library (M21-M60 + finalist v1/v2). Gitignored, regenerable.
- **Hackathon prize alignment:** Best UI/UX ($3k) + Track 3 First Prize ($8.5k) + Grand Champion ($9k, business potential / completion / Mantle ecosystem fit) + Finalist & Deployment ($1k).
- **Deadline:** 2026-06-15 submission, 2026-07-02/03 Demo Day, 2026-07-10 winners.
