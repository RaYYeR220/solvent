# Solvent — 5-minute demo script

**Audience:** hackathon judges
**Total runtime:** 5 minutes
**Live URL:** https://solvent-three.vercel.app
**Agent attestation stream:** https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c
**Fork demo runbook:** [demo-live-depeg.md](demo-live-depeg.md)

## 0:00–0:30 — Intro (30s)

> Solvent is an autonomous depeg guardian for a stablecoin vault on Mantle
> mainnet. It watches the spread between NAV and DEX price, and when
> divergence crosses policy bounds it executes a pre-approved protective
> action — about once an hour, with every decision attested on-chain.

> Three pieces: a hot-key autonomous agent ticking from GitHub Actions; a
> permissionless ERC-4626 vault plus an attestation contract on Mantle;
> and a dashboard you can open right now.

## 0:30–1:30 — Problem and shape (60s)

> RWA depegs aren't theoretical. UST → terminal. USDC → transient. The
> right action depends on which case you're in, and a human watching at
> 3 AM is not the right answer.

> The vault enforces hard policy: slippage cap, action allowlist, kill
> switch. Live policy is deliberately narrow — SWAP_TO_SAFE only, 500 bps
> terminal threshold. The agent's only privilege is picking which
> pre-approved action to fire; it can never withdraw to an arbitrary
> address, and the owner can't rug either — withdrawals are share-gated.

> Verifiability rides on ERC-8004: the agent is identity 106 in the
> Internet-of-Agents registry Mantle deployed in February. Every tick lands
> as a `DecisionRecorded` attestation, and reputation comes from depositors
> rating the agent on the canonical ReputationRegistry — which reverts
> self-feedback, so every star is third-party by construction.

## 1:30–2:15 — Landing: the agent's case (45s)

> [Open https://solvent-three.vercel.app, scroll the landing]

> The depeg storyboard walks the playbook: CALM, WATCH, EARLY, TERMINAL —
> what the agent reads in each regime and what it fires.

> The scoreboard is a benchmark on a UST-shaped terminal collapse: the AI
> preserves 98.5% of vault value, a human with realistic reaction time
> keeps 78%, HODL keeps 10%.

> And LiveProof is not a mock — it's the agent's actual attestation feed,
> read live from SolventAttestation on mainnet, MantleScan link per
> decision.

## 2:15–3:00 — Fork demo: full depeg response (45s)

> [Cut to the fork-demo recording — see demo-live-depeg.md]

> Mainnet won't depeg on cue, so we forked it. Anvil fork of Mantle: real
> Agni pools, real INIT Capital, a USDY vault. Two scenarios, both
> end-to-end.

> One — terminal depeg, pool deep enough to exit: the agent fires
> SWAP_TO_SAFE, the vault goes USDY → USDC in one tx, value preserved.

> Two — early depeg, but the vault holds more than the pool can absorb;
> dumping would crater the price. So the agent hedges instead:
> BRIDGE_VIA_LENDING moves the USDY into INIT as collateral and borrows
> USDC out — watch the dashboard's VAULT MODE flip DIRECT → BRIDGED. On
> the re-peg it unwinds, back to USDY, totalAssets preserved across the
> round-trip.

> Same engine as mainnet: the agent chooses swap versus bridge from
> liquidity depth against vault balance. Live policy keeps the bridge
> disabled until USDY clears Ondo's allowlist.

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

> And as a depositor you can rate the agent — that's a real `giveFeedback`
> on the canonical ERC-8004 ReputationRegistry, the one the agent itself
> can't write to.

## 4:00–4:30 — Live agent on Mantle (30s)

> [Switch to MantleScan tab on the agent EOA address]

> Agent's actual tx history — every entry is an `attestObservation` or
> `executeProtectiveAction` call. The URI field is a Pinata-pinned JSON
> payload with the signal snapshot, regime, and decision; the on-chain
> `signalsHash` commits to those bytes. The dashboard's decision log and
> NAV/market chart are built from the same `DecisionRecorded` events on
> SolventAttestation, filtered by our agentId.

## 4:30–5:00 — Close (30s)

> The Verifiable Guardian thesis: autonomous on-chain agents become
> trustworthy through visible decisions, not through promises. Solvent is
> live on Mantle right now, attesting every tick, and the dashboard is one
> URL away.

> Track 3, AI × RWA — Solvent.
