# Solvent — Autonomous Depeg Guardian on Mantle

Track 3 (AI × RWA) submission to the **Mantle Turing Test 2026** hackathon.

**Live:** https://solvent-three.vercel.app
**Repo:** https://github.com/RaYYeR220/solvent

## What it does

Solvent is an autonomous on-chain agent that guards a stablecoin vault on
Mantle mainnet, watching the spread between the asset's NAV and DEX market
price. The live vault (`SolventVaultV2`) is a permissionless ERC-4626
holding USDT0 — anyone can deposit and mint `svUSDT0` shares. ≈Hourly
(GitHub Actions cron) the agent reads signals, classifies the regime
(CALM / WATCH / EARLY / TERMINAL), and when divergence crosses policy
thresholds it fires a protective action. The live policy is deliberately
narrow: `SWAP_TO_SAFE` only (full exit to USDC via Agni,
`allowedActions = 2`). The second escape hatch — post collateral to INIT
Capital and borrow the safe asset (`BRIDGE_VIA_LENDING`), unwound on
re-peg — is implemented and proven end-to-end on a Mantle mainnet fork;
see [the fork demo](#fork-demo--full-depeg-response-end-to-end). USDY (the
actual RWA) is the fork-demo asset; running it live waits on Ondo's
allowlist.

Every tick — action or no action — the agent writes a `DecisionRecorded`
attestation to `SolventAttestation`: regime, reason code, hash of the
signal snapshot, action, outcome, and an IPFS URI with the full payload.
The agent holds ERC-8004 identity agentId 106 on the IdentityRegistry
Mantle deployed in Feb 2026 as Internet-of-Agents infrastructure.
Reputation is kept separate from telemetry: depositors rate the agent on
the canonical ERC-8004 ReputationRegistry through the dashboard, and the
registry reverts self-feedback — every rating is third-party by
construction.

The "Verifiable Guardian" thesis: an autonomous agent operating real funds
becomes trustworthy when every decision is *visible* — same input → same
attested decision, every tick, forever, even when nothing happens. The
landing page makes that visibility legible: a live on-chain attestation
feed (LiveProof), a depeg storyboard walking the agent's playbook, and an
explicit AI-vs-human-vs-HODL benchmark (terminal collapse: AI preserves
98.5% of vault value vs 78% for human reaction time vs 10% for HODL). The
[fork demo runbook](docs/demo-live-depeg.md) reproduces a full depeg
response end-to-end.

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │              MANTLE MAINNET                 │
                 │                                             │
    ┌────────┐   │  ┌─────────────┐   ┌─────────────────────┐  │
    │ wallet │──▶│  │ SolventVault│◀──│ AgniDexAdapter      │  │
    │  user  │   │  │ V2 custody +│   └─────────────────────┘  │
    └────────┘   │  │  policy     │   ┌─────────────────────┐  │
                 │  │  enforcement│◀──│ InitLendingAdapter  │  │
                 │  └─────┬───────┘   └─────────────────────┘  │
                 │        │                                    │
                 │        ▼                                    │
                 │  ┌──────────────┐  ┌────────────────────┐   │
                 │  │SolventAttest │  │ ERC-8004           │   │
                 │  │ .record()    │  │ ReputationRegistry │   │
                 │  └──────▲───────┘  └─────────▲──────────┘   │
                 │         │                    │              │
                 └─────────│────────────────────│──────────────┘
                           │ attest every tick  │ giveFeedback
                           │                    │ (depositors only —
            ┌──────────────┴──┐                 │ registry reverts
            │   Agent EOA     │                 │ self-feedback)
            │  (viem write)   │                 │
            └────────▲────────┘                 │
                     │ ≈hourly tick             │
            ┌────────┴────────┐     ┌───────────┴───────────┐
            │  GitHub Actions │     │ Vercel dashboard      │
            │ cron 23 * * * * │     │ wagmi reads · deposit │
            └─────────────────┘     │ / withdraw · rate     │
                                    └───────────────────────┘
```

**Contracts** (Foundry, Solidity 0.8.24) — `contracts/`:
- `SolventVaultV2` — ERC-4626 vault, live on mainnet. Shares (`svUSDT0`)
  mint 1:1 on deposit. `totalAssets()` counts the policy safe-asset balance
  at nominal 1:1 so share value is preserved across `SWAP_TO_SAFE`. Adds
  `redeemAll(shares, receiver)` for the safe-mode mixed-asset redemption
  path. Owner cannot rug: withdrawals are share-gated and `rescue()` only
  works after the kill switch is thrown.
- `SolventVault` (V1) — custody-only deployer vault. Kept on-chain as a
  deprecated reference; kill-switched 2026-05-30.
- `SolventAttestation` — append-only decision log (`DecisionRecorded`
  events); best-effort mirror to the ERC-8004 ReputationRegistry via
  try/catch (the registry's self-feedback guard rejects the agent's own
  writes — by design, the registry only holds third-party ratings).
- `AgniDexAdapter` — wraps Agni V3 SwapRouter behind a V2-shaped IDexRouter
- `InitLendingAdapter` — wraps INIT Capital positions behind Aave-style ILendingVenue
- `SolventVaultV2_1` + `InitLendingAdapterV2` — **fork-demo only**:
  INIT-aware `totalAssets()` and a real USDY-collateral → USDC-borrow
  bridge. Not deployed to mainnet; exercised by the fork demo and fork tests.

**Agent** (TypeScript, viem 2.x) — `agent/`:
- Stateless `runTick`: gather signals → assess regime → select action → pin payload to IPFS → submit tx → `SolventAttestation.record` on-chain
- Action choice is liquidity-aware: swap when the pool can absorb the exit, bridge (where policy allows it) when it can't
- Runs ≈hourly via `.github/workflows/agent-tick.yml` (cron `23 * * * *`; GitHub may delay scheduled runs)

**Dashboard** (Next.js 15 static export, wagmi 2.x + ConnectKit) — `web/`:
- Live `useReadContracts` batch reads with 12s refetch
- Decision log + NAV/MKT chart built from `DecisionRecorded` events on
  `SolventAttestation` (filtered by agentId 106), live watch + historical
  `getLogs` backfill
- Deposit/withdraw flow (approve → deposit; withdraw auto-routes to
  `redeemAll` when the vault holds safe asset) and a VAULT MODE indicator
  (DIRECT / BRIDGED)
- Depositor reputation: any non-owner wallet rates the agent on the
  canonical ERC-8004 ReputationRegistry (`giveFeedback`, agentId 106). The
  registry reverts self-feedback, so the agent's owner cannot inflate its
  own score
- Landing: LiveProof (live attestation feed), depeg storyboard,
  AI-vs-human benchmark scoreboard, trust model
- Deployed to Vercel; auto-deploys on push to master

## Fork demo — full depeg response, end-to-end

Live mainnet runs the narrow swap-only policy. The full playbook —
including the lending-bridge hedge — is proven on a local anvil fork of
Mantle mainnet, against the real Agni pools and real INIT Capital
contracts. Runbook: [docs/demo-live-depeg.md](docs/demo-live-depeg.md).
Two scenarios, both verified end-to-end:

1. **Terminal depeg → `SWAP_TO_SAFE`.** USDY depegs past the terminal
   threshold and the pool can absorb the vault's exit (balance ≤ pool
   depth). The agent fully exits to USDC in one tx — value preserved.
2. **Early depeg + thin pool → `BRIDGE_VIA_LENDING` → `UNWIND_BRIDGE`.**
   The vault's balance exceeds the pool's exit depth, so a swap can't
   clear. The agent hedges instead: USDY into INIT as collateral, USDC
   borrowed out, `totalAssets()` preserved. On re-peg it unwinds and
   returns to USDY — the dashboard's VAULT MODE flips DIRECT → BRIDGED →
   DIRECT live.

The point: the agent *chooses* between swap and bridge from liquidity
depth vs vault balance — it is not a hardcoded if-depeg-then-swap. The
bridge path stays fork-only for now because USDT0 has no INIT market and
mainnet USDY waits on Ondo's allowlist.

## Live links

| | |
|---|---|
| Dashboard | https://solvent-three.vercel.app |
| SolventVaultV2 (active) | https://mantlescan.xyz/address/0xDDEd84Ef1ceA80af70b23B599cC9672a15c57c9f |
| SolventVault V1 (deprecated) | https://mantlescan.xyz/address/0x06513470e16a7d6071A12708c38a6fa0ED66469c |
| SolventAttestation | https://mantlescan.xyz/address/0x89D3F83B777b245A80baec60277B449B8E72B5D3 |
| Agent EOA (decision tx stream) | https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c |
| ERC-8004 IdentityRegistry (agentId 106) | https://mantlescan.xyz/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 |
| ERC-8004 ReputationRegistry | https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 |

Source verification on Mantlescan: SolventAttestation, both adapters, and
V1 are verified; SolventVaultV2 verification is in progress (the bytecode
is on-chain at the address above either way).

## For judges — verify everything on-chain

Nothing below requires trusting us.

**1. Watch the agent decide.** Open the SolventAttestation
[events tab](https://mantlescan.xyz/address/0x89D3F83B777b245A80baec60277B449B8E72B5D3#events)
— every `DecisionRecorded` is one agent tick (first topic = agentId 106).
Or from a terminal:

```bash
# last ~5h of decisions (public RPC caps getLogs at 10k blocks)
cast logs --rpc-url https://rpc.mantle.xyz \
  --address 0x89D3F83B777b245A80baec60277B449B8E72B5D3 \
  'DecisionRecorded(uint256,address,uint256,uint8,bytes32,bytes32,uint8,int256,string)' \
  --from-block $(($(cast block-number --rpc-url https://rpc.mantle.xyz) - 9999))
```

Each record carries regime, reason code, signals hash, action, outcome,
and an IPFS URI resolving to the exact signal snapshot the hash commits to.

**2. Check the agent's ERC-8004 identity.** AgentId 106 on the
IdentityRegistry resolves to the agent's EOA:

```bash
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
  'ownerOf(uint256)(address)' 106 --rpc-url https://rpc.mantle.xyz
# => 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c (agent EOA)
```

**3. Use the vault yourself.** Open https://solvent-three.vercel.app/app,
connect a wallet holding USDT0 on Mantle, deposit (approve → deposit mints
`svUSDT0` 1:1), withdraw any time. Then rate the agent in the reputation
panel — your `giveFeedback` lands on the canonical ERC-8004
ReputationRegistry, which rejects self-feedback, so every rating shown is
third-party.

**4. Run the fork demo.** Follow
[docs/demo-live-depeg.md](docs/demo-live-depeg.md): anvil fork of Mantle
mainnet, real Agni + INIT contracts, both depeg scenarios scripted. No
mainnet transaction is ever sent.

**5. Run the tests.**

```bash
cd contracts && forge test   # 84 passing incl. live-fork integration tests
                             # (needs internet; MANTLE_RPC_URL=https://rpc.mantle.xyz
                             #  enables the remaining 3 env-gated fork tests)
cd agent && npm install && npm test   # 136 tests
cd web && npm install && npm test     # 73 tests
```

## Running locally

### Contracts

```
cd contracts
forge install
forge test
```

### Agent

```
cd agent
cp .env.example .env
# Edit .env: set AGENT_PRIVATE_KEY (for a test EOA, NOT the live one)
npm install
npm test
npm run tick    # single tick against live Mantle
```

### Dashboard

```
cd web
cp .env.local.example .env.local
# Edit .env.local: set NEXT_PUBLIC_WC_PROJECT_ID from cloud.walletconnect.com
npm install
npm run dev     # http://localhost:3000
npm test
```

## Hackathon submission

- **Track:** 3 (AI × RWA)
- **Submission deadline:** 2026-06-15
- **Demo day:** 2026-07-02/03
- **Pitch:** see [docs/demo-script.md](docs/demo-script.md)
- **Fork demo runbook:** [docs/demo-live-depeg.md](docs/demo-live-depeg.md)

## License

MIT
