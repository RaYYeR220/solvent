# Solvent — 5-minute demo script

**Audience:** hackathon judges
**Total runtime:** 5 minutes
**Live URL:** https://solvent-three.vercel.app
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

## 3:00–4:00 — Live deposit demo (60s)

> [Open dashboard URL in browser]

> Solvent V2 is a permissionless ERC-4626 vault. Anyone with USDT0 on Mantle
> can deposit and mint svUSDT0 shares. Click "connect wallet" in the top
> right — ConnectKit modal, pick any wallet, sign.

> [Connected]

> Now I'm in the same dashboard the agent watches. Type "10" in the deposit
> tab — that's 10 USDT0. First click approves the spend; second click
> mints 10 svUSDT0 shares. Tx links go straight to MantleScan.

> Withdrawing's the same shape. If the agent has fired SWAP_TO_SAFE, the
> vault holds USDC instead of USDT0; the WITHDRAW button auto-routes to
> `redeemAll` for a pro-rata USDT0+USDC payout — and the panel tells you
> that's what'll happen.

## 4:00–4:30 — Live agent on Mantle (30s)

> [Switch to MantleScan tab on the agent EOA address]

> Agent's actual tx history — every entry is an `attestObservation` or
> `executeProtectiveAction` call. The URI field is a Pinata-pinned JSON
> payload with the signal snapshot, regime, and decision; the on-chain
> `feedbackHash` commits to those bytes. The dashboard's decision log
> pulls the same events live via `useWatchContractEvent` on
> ReputationRegistry, filtered by our agentId.

## 4:30–5:00 — Close (30s)

> The Verifiable Guardian thesis: autonomous on-chain agents become
> trustworthy through visible decisions, not through promises. Solvent is
> live on Mantle right now, attesting hourly, and the dashboard is one URL
> away.

> Track 3, AI × RWA — Solvent.
