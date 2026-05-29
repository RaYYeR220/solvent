# Solvent — 5-minute demo script

**Audience:** hackathon judges
**Total runtime:** 5 minutes
**Live URL:** `<paste Vercel URL>`
**Agent attestation stream:** https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c

## 0:00–0:30 — Intro (30s)

> Solvent is an autonomous depeg guardian for a real-world-asset vault on
> Mantle. It watches the spread between NAV and DEX price, and when divergence
> crosses policy bounds, it executes a pre-approved protective swap or bridge
> — every hour, with every decision attested on-chain via Mantle's
> ERC-8004 ReputationRegistry.

> Three pieces: a hot-key autonomous agent running hourly from GitHub Actions;
> a vault-and-attestation contract pair on Mantle; and a dashboard you can
> open right now.

## 0:30–1:30 — Problem and shape (60s)

> RWA depegs aren't theoretical. UST → terminal. USDC → transient. The
> right action depends on which case you're in, and a human watching at
> 3 AM is not the right answer.

> The vault enforces hard policy: slippage cap, LTV cap, action allowlist,
> kill switch. The agent's only privilege is to pick which pre-approved
> action to fire — it can never withdraw to an arbitrary address. The
> verifiability story rides on ERC-8004: every tick produces an attestation
> that's both a public log entry on Mantle and a feedback record in the
> Internet-of-Agents registry that Mantle deployed in February.

## 1:30–3:00 — Fork-replay (90s)

> [Switch dashboard to ForkReplay panel, select "terminal-collapse"]

> Scripted scenario: stable for two ticks, flash crash to $0.85 on tick 2.
> The agent detects 1500 bps divergence — crosses our 1000 bps terminal
> threshold — fires SWAP_TO_SAFE with reason "terminal-exit". Vault asset
> balance goes from 1000 USDT0 to zero in one tx. Ticks 3 through 7 the
> price keeps falling to $0.50, the agent stays out, attesting observations
> the whole time.

> [Scrub to tick 1 of transient-depeg, click play]

> Same engine on the transient-depeg scenario reacts at the 4% mark — exits
> early, then attests calmly through the recovery. Same code, different world.

## 3:00–4:30 — Live agent on Mantle (90s)

> [Switch to MantleScan tab on the agent EOA address]

> This is the agent's actual transaction history. Every entry is an
> `attestObservation` or `executeProtectiveAction` call into the vault. Click
> any of them and you see the URI field — that's a Pinata-pinned JSON
> payload with the signal snapshot, the regime classification, and the
> decision. The on-chain `feedbackHash` commits to those bytes.

> [Switch to dashboard]

> The decision log panel here pulls the same events live via wagmi —
> `useWatchContractEvent` on ReputationRegistry filtered by our agentId,
> resolves each URI through Pinata, renders the regime and action. Right
> now the agent is in CALM regime because the live USDT0/USDC pool has
> zero liquidity — we'd see EARLY/TERMINAL the moment a real divergence
> appeared, and the agent already proved on the fork it knows what to do.

## 4:30–5:00 — Close (30s)

> The Verifiable Guardian thesis: autonomous on-chain agents become
> trustworthy through visible decisions, not through promises. Solvent is
> live on Mantle right now, attesting hourly, and the dashboard is one URL
> away.

> Track 3, AI × RWA — Solvent.
