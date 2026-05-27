# Solvent — Verifiable Depeg Guardian for RWA on Mantle

**Design spec** · 2026-05-27 · Status: approved, pre-implementation
**Hackathon:** The Turing Test Hackathon 2026, Phase II "AI Awakening" — DoraHacks
**Track:** 3 — AI × RWA ("dynamic yield strategies and automated risk management for USDY and mETH")
**Submission deadline:** 2026-06-15 · Demo Day 2026-07-02/03 · Winners 2026-07-10

---

## 1. One-paragraph summary

Solvent is an autonomous on-chain agent that protects tokenized real-world assets
(USDY, mETH) on Mantle from **depeg** — the market price drifting from the asset's
real backing value (USDY NAV / mETH exchange rate). A user deposits into the Solvent
vault and picks a risk policy. A 24/7 off-chain agent compares market price against
backing value, liquidity depth, and oracle divergence; on an early depeg signal it
autonomously de-risks per the user's pre-committed policy (early exit → liquidity
bridge → terminal stop-loss), and in calm regimes parks capital in safe yield. Every
decision is written on-chain as an ERC-8004 validation attestation — a verifiable
track record. The demo runs the agent head-to-head against a "human" baseline vault on
a Mantle-mainnet fork, replaying historical depeg shapes, to make the hackathon's
Human-vs-AI thesis concrete and reproducible.

## 2. Why this wins (strategy)

- **Track fit is literal.** Track 3 wording = "dynamic yield + automated risk
  management for USDY and mETH." Solvent maps to it 1:1.
- **Low-competition angle.** Trading & Consumer tracks are always the most crowded;
  RWA requires Mantle-specific knowledge (USDY/mETH/money markets) = a natural filter.
  Within RWA, risk-management is less done than yield-chasing.
- **Judging alignment.** Judging rewards on-chain immutable decision traces and a
  Human-vs-AI mechanism. Our ERC-8004 attestation log + head-to-head benchmark are
  exactly that substrate.
- **Prize stacking (same build wins several).** One excellent, complete, Mantle-native
  build targets **Track 3 First Prize ($8.5k)**, **Grand Champion ($9k:** business
  potential + completion + Mantle ecosystem fit**)**, and **Finalist & Deployment
  ($1k)** simultaneously. **Best UI/UX ($3k)** rides on the demo dashboard we build
  anyway. **Community Voting ($17k)** is decoupled (pure X engagement) and explicitly
  NOT targeted — we have no X audience; we do only the submission-required X thread.
- **Ecosystem fit.** Uses real Mantle protocols (Aave V3 on Mantle since 2026-02-11,
  $800M+; INIT Capital lists USDY+mETH; Merchant Moe/Agni DEXes; Ondo USDY) — all
  on-chain, never leaving Mantle.

## 3. The honest core (handled, not hidden)

RWA on-chain liquidity on Mantle is thin (USDY ~$29M tokenized; money-market TVLs
~$10M). So "sell into the DEX on a depeg" is mostly infeasible at size — selling into a
drying pool destroys value. **Therefore the hero mechanic is timing + action selection,
not magic liquidity:**

- **Early exit** on a *small* divergence, before liquidity vanishes — the core edge.
- **Liquidity bridge** for a *suspected/transient* depeg: deposit the at-risk asset as
  collateral into a Mantle money market (INIT for USDY, Aave/Lendle for mETH/ETH) and
  borrow safe stables — a bridge across **time**, not across chains. Unwind on re-peg.
  Guardrails required: only when likely transient; manage liquidation; terminal
  threshold beyond which we exit anyway. This is framed as a transient-depeg bridge with
  guardrails, NOT an oracle-lag exploit.
- If even the bridge is impossible, the agent does **not** dump into an empty pool — it
  attests `protect-failed: illiquid` and alerts. Value = early timing + pre-committed
  policy + automation.

## 4. Architecture & components

On-chain holds **custody, rules, and the verifiable log**; the **brain is off-chain and
replaceable**. Each component has one purpose and is independently testable.

```
                        +-------------------------------------+
        Ondo NAV API -->|                                     |
        DEX price/depth-| Solvent Agent (TypeScript, off-chain)|
        Aave/INIT state-| watcher + decision engine 24/7      |
                        +------+----------------------+--------+
                    reads on-chain Policy        submits txs
                               |                      |
                 +-------------v-----+    +-----------v-------------+
                 | SolventVault      |    | ERC-8004 Validation     |
                 | (Solidity)        |    | Registry (Mantle)       |
                 | holds USDY/mETH   |    | decision + reason +     |
                 | + Policy + kill   |    | evidence hash + outcome |
                 +-------------------+    +-------------------------+
                               |
                 +-------------v-----------------------------------+
                 | Dashboard (Next.js): live monitor + decision    |
                 | log + Agent-vs-Baseline scoreboard              |
                 +-------------------------------------------------+
```

1. **SolventVault (Solidity)** — holds USDY/mETH. Roles: `owner` (user: deposit,
   withdraw always, set agent/policy/kill switch) and `agent` (scoped: only
   `executeProtectiveAction`). A "dumb" executor — no decision logic, the trust anchor.
2. **Policy (on-chain config)** — user's risk policy; bounds the agent. Verifiable.
3. **ERC-8004 Identity + Validation Registry (deployed by us on Mantle)** — agent has an
   identity "passport"; each decision logged as a validation entry = verifiable track
   record.
4. **Solvent Agent (TypeScript, off-chain)** — gathers signals, reads on-chain Policy,
   decides, submits tx, writes attestation. Stateless decisioning → restartable.
5. **Signal adapters** — `ondoNav`, `dexPrice`, `liquidity`, `lendingState`; each
   isolated and independently mockable.
6. **Scenario Harness + BaselineVault (test/demo only)** — Mantle-fork runner that
   injects a depeg trajectory and drives the agent deterministically; BaselineVault
   runs scripted "human" behavior.
7. **Dashboard (Next.js)** — live monitor, decision log, Agent-vs-Baseline scoreboard;
   also the Best-UI/UX surface and demo-video visual.

**Key invariant:** the agent can never do anything not permitted by the on-chain Policy
and can never move funds to an arbitrary address — at most execute a ranked set of
protective actions into whitelisted venues / the safe asset. The owner can always
withdraw and can hit the kill switch.

## 5. Data flow (per agent tick)

1. **Gather signals** (adapters, parallel): `nav` (Ondo API for USDY / staking
   exchange-rate for mETH), `marketPrice` (DEX pool, cross-checked with Pyth/RedStone if
   a feed exists), `liquidityDepth` (pool reserves), `oracleDivergence` (source spread).
2. **Assess regime** — pure function `assessRegime(signals, policy)` →
   `CALM | WATCH | EARLY_DEPEG | TERMINAL_DEPEG`. Deterministic → unit-testable and
   yields the attestation reason code.
3. **Select action** — ranked by Policy:
   - `CALM` → park capital in best safe yield (dynamic yield).
   - `WATCH` → no action, faster polling + observation attestation.
   - `EARLY_DEPEG` → **early exit** to safe asset while liquidity allows; if exit is too
     costly and depeg looks transient → **liquidity bridge** (deposit collateral, borrow
     stables) with guardrails.
   - `TERMINAL_DEPEG` → forced exit / unwind bridge and exit (stop-loss).
4. **Execute** — agent calls `executeProtectiveAction`; vault validates action ∈ policy
   and params within bounds (minOut ≥ slippage floor, LTV ≤ cap) on-chain, else reverts.
5. **Attest** — write `{regime, reasonCode, signalsHash, action, txHash, outcome}` to the
   ERC-8004 Validation Registry — immutable evaluation trace.

## 6. Human-vs-AI benchmark (differentiator)

A concrete, verifiable, reproducible "Turing Test."

- **Two vaults, equal start, same scenario.** Agent vault (Solvent) vs Baseline vault
  ("human") with two behavior models: *passive HODL* and *delayed human* (reacts, but
  with human latency — too late / panics into a crystallized loss).
- **Narrative inversion:** we don't claim the AI is indistinguishable from a human — we
  show the AI does what a human **can't**: round-the-clock sub-minute vigilance + instant
  pre-committed execution + liquidity-aware action selection. Even a *reasonable* human
  loses (transient: panics or reacts late; terminal: asleep / liquidity already gone).
- **Scenario Harness (Mantle-mainnet fork):** fork at a block (real Aave/INIT/DEX/USDY),
  deploy both vaults with equal capital, inject a depeg trajectory into the forked DEX
  pool. Two canonical scenarios by real-event shape: **transient** (USDC March-2023:
  $1 → ~$0.88 → recovers; liquidity bridge shines) and **terminal** (UST: collapse;
  early exit + stop-loss shines). Step the chain; agent acts each tick, baseline runs its
  scripted behavior. Output: final value per vault, % preserved, on-chain attestation log.
- **Verifiability:** harness uses the same contract bytecode as the mainnet deployment;
  decisions are deterministic; ERC-8004 entries are the immutable transcript a judge can
  replay.

## 7. Smart contracts

- **`SolventVault.sol`** — roles `owner`/`agent`; `deposit`/`withdraw` (owner, withdraw
  always); `setAgent`/`setPolicy`/`setKillSwitch` (owner);
  `executeProtectiveAction(action, params)` (agent only, requires `!killSwitch`,
  on-chain validates action ∈ `policy.allowedActions` and params within bounds). Handlers:
  `_swapToSafe`, `_bridgeViaLending`, `_unwindBridge`, `_parkYield`. Emits events per
  action. Invariant: agent cannot exfiltrate funds or act outside whitelisted venues.
- **`Policy`** (struct in vault): `earlyDivergenceBps`, `terminalDivergenceBps`,
  `liquidityFloor`, `maxSlippageBps`, `safeAsset`, `bridgeVenue`, `maxBridgeLTV`,
  `allowedActions` (bitmap + order).
- **`SolventAttestation`** — thin wrapper over the ERC-8004 Validation Registry; writes
  decision records. Agent identity registered once in the Identity Registry.
- **`ScenarioHarness` + `BaselineVault`** (test/demo only) — Foundry scripts + cheatcodes
  move the forked pool price (large swaps / mocked exchange-rate for mETH), `vm.warp/roll`
  for time; BaselineVault runs scripted human behavior.

## 8. Agent (TypeScript)

Modules with clear boundaries:
- `adapters/` — `ondoNav`, `dexPrice`, `liquidity`, `lendingState` (each mockable).
- `engine/` — `assessRegime()`, `selectAction()` — **pure functions**, the unit-test core.
- `executor/` — tx building/sending via viem.
- `attestor/` — writes ERC-8004 validation entries.
- `loop()` — tick: signals → assessRegime → selectAction → (tx) → attest. No critical
  state held (truth read from chain + feeds each tick) → restartable.

## 9. Safety & error handling

Fail-safe philosophy: **inaction over wrong action** when signals are untrusted; owner
withdrawal + kill switch always available; agent authority minimal and on-chain-bounded.

| Failure mode | Response |
| --- | --- |
| Liquidity trap | Simulate output vs `liquidityFloor`; if slippage > `maxSlippageBps` do not sell → bridge; if impossible → attest `protect-failed: illiquid` + alert + hold. Contract enforces `minOut`. |
| Oracle glitch / divergence | Cross-check ≥2 sources; if spread > threshold, source untrusted → don't act on a single suspicious feed; drop to WATCH; attest `signal-untrusted`. |
| Ondo NAV API down | Use last-known NAV with staleness clock; beyond limit → degrade to DEX-price-only conservative mode; attest degraded mode; never act blind. |
| Agent crash | Funds safe by design; on restart, reconstruct state from chain + feeds; owner can withdraw / kill meanwhile; dashboard heartbeat. |
| Compromised agent key | Worst case: only policy-bounded protective actions; cannot exfiltrate; owner kill switch revokes instantly. (Threat model stated explicitly.) |
| Bridge liquidation risk | Monitor position health; if collateral nears terminal depeg → unwind/exit before liquidation; `maxBridgeLTV` cap on-chain. |
| Tx revert / reorg | Executor checks receipt; re-assess next tick; decisions idempotent (read current state) → no double action. |

## 10. Testing strategy (TDD)

- **Unit (TS):** `assessRegime()` / `selectAction()` — table-driven over signal
  combinations. Adapters with mocks (NAV stale, oracle divergence, dry liquidity).
- **Contracts (Foundry):** access control (only agent acts, only owner withdraws, kill
  switch blocks); policy-bound enforcement (reverts out-of-bounds, `minOut`, LTV cap);
  each handler. Fuzz/property: agent can't reduce owner's withdrawable claim except via
  whitelisted safe conversion; can't send to non-whitelisted address.
- **Fork integration (Foundry harness):** full transient + terminal scenarios on a Mantle
  fork against real Aave/INIT/DEX — assert Agent vault preserves more than baseline,
  attestations written, no liquidity-trap dumping. Doubles as the demo + verifiability proof.
- **E2E dry-run:** agent process + dashboard against the fork, recorded → the demo video.

## 11. Demo & UI

- **Web2 onboarding** (Best UI/UX criterion): connect wallet → plain-language policy
  preset ("Protect aggressively / balanced / terminal-only") → deposit. No jargon.
- **Live monitor:** price↔NAV chart + divergence band, current regime, agent heartbeat.
- **Decision log:** streamed decisions with reason codes + links to Mantle explorer txs.
- **Scoreboard:** Agent vs Baseline, % preserved, transient ⇄ terminal toggle.
- Visual mockups of the dashboard to be produced (browser companion) before coding the UI.

## 12. Scope (deadline 2026-06-15)

**MVP (core of a winning submission):**
- Vault + Policy + on-chain guardrails + kill switch — asset **USDY**.
- Agent: adapters (Ondo NAV, DEX price, liquidity) + `assessRegime`/`selectAction` +
  executor + attestor.
- ERC-8004 Identity + Validation Registry on Mantle; attestations written.
- Actions: early exit + liquidity bridge (INIT) + park-yield in calm.
- Harness on fork: transient + terminal, Agent vs Baseline (passive + delayed-human).
- Dashboard: monitor + decision log + scoreboard + toggle.
- Deploy contracts to Mantle mainnet; demo video; X thread; GitHub.

**Stretch (likely time available):**
- Second asset **mETH** (exchange-rate discount path).
- Aave as bridge venue (mETH/ETH) in addition to INIT.
- Dashboard polish to Best-UI/UX bar.
- Pyth/RedStone oracle cross-check on top of pool price.

**Optional / future (out of MVP):**
- Live "human exit" button in demo (interactive) — revisit at the end if time remains.
- Multi-user / policy marketplace (was Approach B) — explicitly out of scope.

## 13. Build order (TDD, dependency-ordered)

1. Scaffold (Foundry + TS) + Mantle fork config.
2. Contracts Vault + Policy + access control + kill switch with Foundry tests (TDD);
   stub handlers.
3. ERC-8004 registries on fork + Attestation wrapper + tests.
4. Agent pure functions (`assessRegime`/`selectAction`) + unit tests (TDD).
5. Adapters with mocks + tests → wire to fork.
6. Executor + handlers (swap, bridge) against real Aave/INIT on fork + integration tests.
7. Harness: depeg injector + BaselineVault; full fork test (transient + terminal):
   Agent > Baseline.
8. Dashboard: read chain + attestation log; monitor + scoreboard + toggle.
9. Deploy to Mantle mainnet; record demo; X thread + pitch.
10. (Stretch) mETH, Aave, UI polish. (Optional) human button.

## 14. Open items to resolve during planning / build

- Confirm Pyth/RedStone USDY + mETH feed coverage on Mantle; if none, use DEX pool price
  directly (cross-check vs Ondo NAV only).
- Confirm INIT Capital USDY market borrow capacity is enough for a credible bridge demo
  (else demo the bridge with a fork-seeded supply, and state the real-liquidity caveat).
- Confirm whether Finalist "deployed on Mantle" award requires mainnet (assume yes; deploy
  contracts to Mantle mainnet regardless — gas is cheap).
- Exact ERC-8004 reference contracts to port to Mantle (Identity + Validation registries).
- Mantle mainnet RPC + a funded deployer/agent key (operational — user-side).

## 15. References

- Hackathon: https://dorahacks.io/hackathon/mantleturingtesthackathon2026
- ERC-8004 Trustless Agents: https://eips.ethereum.org/EIPS/eip-8004 (ratified Jan 2026,
  on Ethereum mainnet Feb 2026; Identity + Reputation + Validation registries).
- Aave V3 on Mantle: launched 2026-02-11 via Bybit, $800M+ market size.
- Ondo USDY on Mantle (~$29M); mETH ($791M) / cmETH ($277M).
- Money markets on Mantle: INIT Capital (lists USDY + mETH), Lendle (mETH).
- Prior brief: `BRIEF.md`.
