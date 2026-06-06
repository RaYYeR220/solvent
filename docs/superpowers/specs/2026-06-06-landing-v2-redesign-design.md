# Solvent — Landing V2 Redesign — Spec

**Date:** 2026-06-06
**Goal:** Relaunch the marketing landing (`web/src/app/page.tsx`) around the V2
product. Remove the `ForkReplay` scrubber and replace the "evidence" beat with
**live on-chain proof** pulled from the running agent. Modernize stale copy
(USDY → honest "RWA thesis, live on USDT0 today").

## Why

The landing still sells the V1 story: "Deposit USDY", a canned `ForkReplay`
scrubber as proof, and a `#replay` CTA. The product is now a permissionless
ERC-4626 USDT0 vault with an agent **live on Mantle mainnet** posting hourly
attestations. The strongest, most honest proof we have is that live trace —
not a pre-recorded replay. Removing `ForkReplay` also orphans the `#replay`
anchor and the "SECTION B · EVIDENCE" divider, so the page needs a re-thread.

## Decisions (locked with user)

1. **Scope:** full rework under V2 (not just delete replay).
2. **Hero hook:** keep "Depeg is fast. Humans aren't." + benchmark scoreboard,
   re-anchored on "live on Mantle" (a live badge in the hero).
3. **Evidence beat:** live on-chain proof (real attestations), reusing
   `useDecisionLog`.
4. **RWA framing:** RWA-thesis, honest caveat that it runs live on USDT0/USDC
   today while the Ondo USDY allowlist is pending. Keeps Track-3 (AI×RWA) fit
   without overclaiming.

## Page structure (after)

```
Header (logo · open app →)                                   [keep]

HERO  [server component shell + client <LiveBadge/> island]
  // depeg.guardian · track 3 · ai × rwa                     [keep]
  Depeg is fast. Humans aren't.                              [keep headline]
  ● Agent live on Mantle · N attestations · last tick Xm ago [NEW LiveBadge]
  An autonomous agent guarding on-chain deposits from depeg. [NEW product line]
    Running live on USDT0/USDC · Ondo USDY (RWA) pending allowlist. [muted caveat]
  On a UST-shape collapse:  <Scoreboard ai human hodl/>      [keep]
  [ open the live dashboard → ]  → /app                      [was "▶ watch the replay"]

── section B · LIVE PROOF ──                                 [was "evidence"]
  <LiveProof/>  [NEW client island]
    ● LIVE · agent ticking hourly · N attestations on-chain · last tick Xm ago
    last 3–4 decisions:  HH:MM · REGIME · action · tx → mantlescan
    [ verify on Mantlescan ]   [ open live dashboard → ]

<HowItWorks/>  (Signal / Assess / Execute)                   [copy updated]
CTA: "Deposit USDT0. Solvent watches the rest." → /app       [was "Deposit USDY"]
<Footer/>                                                     [keep]
```

## New component: `LiveProof.tsx`

- `"use client"`. Reads `useDecisionLog()` (same hook as the dashboard:
  400k-block `getLogs` backfill + live watch; returns `{ entries,
  attestationsTotal, isLoading }`).
- Renders inside the existing `Panel` (Schematic-Blueprint look).
- Content:
  - **Status row:** live dot + "agent ticking hourly" + `attestationsTotal`
    attestations on-chain + last-tick "Xm ago" (from `entries[0].payload.timestamp`).
  - **Recent decisions:** `entries.slice(0, 4)` → `HH:MM` (from
    `payload.timestamp`) · `payload.regime` · `payload.decision.action` ·
    short tx → `${MANTLESCAN}/tx/${txHash}`.
  - **Actions:** `[ verify on Mantlescan ]` (attestation address page) +
    `[ open live dashboard → ]` (`/app`).
  - **States:** `isLoading` → "reading on-chain attestations…"; zero entries
    (post-load) → muted "awaiting next tick" (should not happen — agent has
    history, but handle gracefully).
- **Exports** a compact `LiveBadge` from the same file (or a sibling) for the
  hero: one line — live dot + "Agent live on Mantle · N attestations · last
  tick Xm ago". Both call `useDecisionLog`; the react-query backfill is shared
  via its cache key (`["historical-decisions", attestation, agentId]`), so the
  second mount reuses the cached logs — no double network cost beyond live
  watchers.

### Time formatting (client-only, no hydration mismatch)

`entries` are empty during SSR (wagmi is client-only), so timestamps only
render after the client query resolves — `Date.now()`-based "Xm ago" is
computed on the client only, no server/client divergence. `HH:MM` via
`toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`.

## Copy changes

- **Hero:** add `LiveBadge`, add product line + muted RWA caveat. Headline and
  eyebrow unchanged. Hero CTA: "▶ watch the replay" (`#replay`) →
  "open the live dashboard →" (`/app`).
- **Scoreboard:** keep; add a small muted source caption
  ("AI-vs-human benchmark · terminal-collapse scenario").
- **HowItWorks — Signal card:** keep Price(DEX)-vs-NAV(Ondo oracle) thesis,
  add honest note that the live vault runs on USDT0/USDC today.
  **Execute card:** keep ERC-8004 attestation line.
- **Bottom CTA:** "Deposit USDY." → "Deposit USDT0."

## Removal / cleanup (ForkReplay)

- Delete `web/src/components/ForkReplay.tsx`,
  `web/tests/ForkReplay.test.tsx` (or wherever it lives),
  `web/public/replay-transient.json`, `web/public/replay-terminal.json`.
- Verify no other importers (`grep ForkReplay`, `grep replay-`) before deleting.
- Remove the `#replay` section + its divider from `page.tsx`.

## Testing

- vitest:
  - `LiveProof.test.tsx` (new) — mock `useDecisionLog`, assert status row
    (count, "live"), recent-decision rows, and the loading/empty states.
  - `page.test.tsx` (update) — no `ForkReplay`/"replay" text; `LiveProof`
    present; CTA text "Deposit USDT0"; hero CTA → `/app`.
  - delete `ForkReplay.test.tsx`.
- `tsc --noEmit` clean; `next build` green.
- Playwright visual check of `/app`-style render at `localhost:3000/`
  (wait ~9s for getLogs+IPFS, screenshot, clean up the png).

## Out of scope (deferred — user may expand later)

- Live-depeg demo video (separate NEXT task; the headline differentiator).
- Any landing expansion beyond the above ("landing feels a bit empty" — user
  will review the redesign first, then decide what extra beats to add). Build
  `LiveProof` + sections so adding blocks later is cheap.

## Done criteria

- Landing renders the structure above; no `ForkReplay`, no `#replay` anchor,
  no "Deposit USDY".
- `LiveProof` + hero `LiveBadge` show real attestation count + recent
  decisions from the live agent, with working Mantlescan links.
- All vitest green (incl. new `LiveProof.test.tsx`, updated `page.test.tsx`);
  `tsc --noEmit` + `next build` green.
- Copy honestly reflects V2 (RWA thesis, live on USDT0/USDC).
