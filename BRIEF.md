# Mantle Turing Test Hackathon 2026 — Phase II "AI Awakening"

**Status:** CONFIRMED concept (2026-05-20) — depeg-protection angle, tech stack at Claude's discretion. Not started.
**Platform:** DoraHacks (co-hosts Bybit, Byreal, BGA; backers Tencent Cloud)
**URL:** https://dorahacks.io/hackathon/mantleturingtesthackathon2026

## Dates (Phase II)
- Submission window: 2026-05-01 – **2026-06-15**
- Demo Day: 2026-07-02 / 07-03
- Final winners: 2026-07-10

## Prizes ($100k Phase II + $20k Phase I + $103k compute credits)
- Grand Champion: $9k
- Track First Prizes: 6 × $8.5k = $51k
- Community Voting: 2 × $8.5k = $17k
- Best UI/UX: $3k
- Top 20 Finalists (deployment): 20 × $1k = $20k
- Compute credits: Nansen, Elfa AI, Surf AI, Orbit AI, AltLLM

## Six tracks
1. AI Trading & Strategy — quant bots, Solidity/Python templates, Bybit API  (🔴 most crowded)
2. AI Alpha & Data — smart-money tracking, anomaly detection via TG/Discord
3. **AI × RWA — dynamic yield + automated risk management for USDY, mETH on Mantle RWA infra**  ← target
4. Consumer & Viral DApps — gamified/shareable  (🔴 crowded)
5. AI DevTools — gas optimization, Mantle audit assistants
6. Agentic Wallets & Economy — built using the Byreal Skills CLI

## Target-track strategy (low competition)
- **Track 3 AI×RWA** — narrow, institutional, aligned with backers; requires Mantle-specific RWA knowledge (mETH/cmETH, USDY, money markets) = barrier that filters competitors. Avoid Track 1/4 (saturated).
- Differentiator: lean on the **risk-management** half (less done than yield-chasing) + **on-chain verifiable decisions** (the hackathon's Human-vs-AI thesis).

## Concept — "Solvent" (autonomous depeg guardian for USDY/mETH on Mantle)
A user deposits USDY/mETH into Solvent. The agent protects against **depeg** — the asset's market price drifting from its real backing value (USDY NAV / mETH exchange rate). The agent:
- Continuously compares **market price** (DEX) vs **backing value** (protocol NAV / exchange rate via oracle), plus liquidity depth and oracle divergence.
- On an early depeg signal (or drying liquidity), autonomously **de-risks per the user's pre-set policy**: exit to a safer asset / hedge / move — before the loss realizes. All actions on-chain on Mantle.
- Writes each decision + rationale **on-chain as a risk attestation** (verifiable for the Human-vs-AI benchmark).
- In calm regime ("dynamic yield"): parks capital in the best safe yield (USDY native yield, mETH staking, a stable pool) so it isn't idle.
Hits "dynamic yield AND automated risk management for USDY and mETH"; depeg-protection is a less-crowded angle than yield optimizers, and the pain is relatable (UST / USDC-2023).

Honest caveat to handle in design: detecting a depeg late can mean exiting into the same illiquidity. Value = early-warning thresholds + a pre-committed policy + automation, not magic.

## Stack (Claude's call — user doesn't need to engage with this)
- **Solidity vault on Mantle** holds the user's USDY/mETH; only the agent (scoped permission) can trigger pre-approved protective actions; user can always withdraw. Kill switch.
- **TypeScript agent** = the 24/7 watcher + decision engine (off-chain), submits txs on-chain.
- **Price feeds:** protocol NAV / exchange rate vs DEX market price, cross-checked with an on-chain oracle on Mantle (RedStone/Pyth — pick whichever has USDY/mETH coverage).
- **On-chain attestation contract** logs each decision (hash + reason code).
- Submission: pitch + demo video + GitHub + Mantle contract address (X thread).

## Resolved (external review 2026-05-20)
- **Byreal Skills CLI / ERC-8004 NOT required for Track 3** (Phase II rules). But adopt **ERC-8004 agent identity** anyway: it earns a bonus AND becomes the on-chain attestation vehicle — the agent logs decisions to its ERC-8004 "passport" instead of a random contract. Cheap to add.
- **Oracle:** there is NO on-chain NAV oracle for USDY. The agent parses Ondo's Web2 API for NAV off-chain, compares it to the DEX market price (Pyth/RedStone on Mantle), and acts on dangerous divergence. This offchain-NAV ↔ onchain-price bridge IS the autonomous-agent value (fits the hackathon thesis). Verify Pyth/RedStone USDY + mETH coverage; if no feed, use the DEX pool price directly.

## Implementation notes / risks (external review 2026-05-20)
- **Liquidity Trap (real flaw to handle):** selling into a depeg fails — pool liquidity dries up in seconds, slippage destroys you (sell $100k into an empty pool → get ~$60k). Protection becomes worse than the problem.
- **De-risk action set (ranked by conditions), not just "sell":**
  - **Early exit** on a SMALL divergence, before liquidity vanishes — this is the core edge.
  - **Liquidity bridge** for a SUSPECTED/transient depeg: deposit the asset as collateral on a Mantle lending market (Lendle/Init) and borrow safe stables — avoids crystallizing the loss, unwind if it re-pegs. Guardrails REQUIRED: only when likely transient, manage liquidation, set a terminal-depeg threshold beyond which you exit anyway.
  - Pushback on reviewer's framing: do NOT design around "borrow before the lending oracle updates" (oracle-lag exploit — fragile; and borrowing against a truly-depegging asset = leverage + liquidation, can be worse). Frame it as a transient-depeg liquidity bridge with guardrails, not an oracle-lag play.

## Next steps
- [ ] Confirm/refine concept
- [ ] Resolve open questions (track rules, money markets)
- [ ] brainstorming → spec → plan
- [ ] Build vault + agent + attestation; deploy on Mantle; demo video
