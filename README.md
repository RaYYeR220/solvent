# Solvent — Autonomous Depeg Guardian on Mantle

Track 3 (AI × RWA) submission to the **Mantle Turing Test 2026** hackathon.

**Live:** https://solvent-three.vercel.app
**Repo:** https://github.com/RaYYeR220/solvent

## What it does

Solvent is an autonomous on-chain agent that monitors a Real-World Asset
(USDY/USDT0) vault every hour, watching the spread between the asset's NAV
and DEX market price. When divergence crosses policy thresholds, the agent
executes a pre-approved protective action — exit to a safe asset via DEX,
or post collateral to lending and borrow safe asset (bridge) — and writes
a verifiable attestation to the ERC-8004 ReputationRegistry that Mantle
deployed in Feb 2026 as Internet-of-Agents infrastructure.

The "Verifiable Guardian" thesis: an autonomous agent operating real funds
becomes trustworthy when every decision is *visible* — same input → same
attested decision, every tick, forever, even when nothing happens. The
dashboard makes that visibility legible: a live MantleScan attestation
stream, a fork-replay scrubber showing how the agent reacts to scripted
depeg scenarios, and an explicit human-vs-AI benchmark that the agent wins
on both transient recoveries and terminal collapses.

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │              MANTLE MAINNET                 │
                 │                                             │
    ┌────────┐   │  ┌─────────────┐   ┌─────────────────────┐  │
    │ wallet │──▶│  │ SolventVault│◀──│ AgniDexAdapter      │  │
    │  user  │   │  │  custody +  │   └─────────────────────┘  │
    └────────┘   │  │  policy     │   ┌─────────────────────┐  │
                 │  │  enforcement│◀──│ InitLendingAdapter  │  │
                 │  └─────┬───────┘   └─────────────────────┘  │
                 │        │                                    │
                 │        ▼                                    │
                 │  ┌──────────────┐  ┌────────────────────┐   │
                 │  │SolventAttest │─▶│ ERC-8004           │   │
                 │  │ . record()   │  │ ReputationRegistry │   │
                 │  └──────────────┘  └─────────┬──────────┘   │
                 │                              │              │
                 └──────────────────────────────│──────────────┘
                                                │
            ┌─────────────────┐  hourly         │
            │  GitHub Actions │ ─tick──┐        │
            │   cron 0 * * *  │        │        │
            └─────────────────┘        │        │
                                       ▼        │
                              ┌──────────────┐  │
                              │ Agent EOA    │  │
                              │ (viem write) │──┘
                              └──────────────┘
                                       ▲
                              ┌────────┴────────┐
                              │  Vercel-hosted   │
                              │  dashboard       │
                              │  (wagmi read)    │
                              └──────────────────┘
```

**Contracts** (Foundry, Solidity 0.8.24) — `contracts/`:
- `SolventVault` — custody + on-chain policy enforcement (kill switch, slippage caps, LTV bounds, allowed-action bitmap)
- `SolventAttestation` — append-only decision log; mirrors each record to ERC-8004 ReputationRegistry via try/catch
- `AgniDexAdapter` — wraps Agni V3 SwapRouter behind a V2-shaped IDexRouter
- `InitLendingAdapter` — wraps INIT Capital positions behind Aave-style ILendingVenue

**Agent** (TypeScript, viem 2.x) — `agent/`:
- Stateless `runTick`: gather signals → assess regime → select action → pin payload to IPFS → submit tx → on-chain `SolventAttestation.record` dual-writes to ERC-8004
- Runs hourly via `.github/workflows/agent-tick.yml`

**Dashboard** (Next.js 15 static export, wagmi 2.x + ConnectKit) — `web/`:
- Live `useReadContracts` batch reads with 12s refetch
- Live `useWatchContractEvent` on ReputationRegistry filtered by agentId 106
- Real ConnectKit deposit flow (approve → deposit)
- Interactive `ForkReplay` scrubber loading committed JSON snapshots
- Deployed to Vercel; auto-deploys on push to master

## Live links

| | |
|---|---|
| Dashboard | https://solvent-three.vercel.app |
| Vault on MantleScan | https://mantlescan.xyz/address/0x06513470e16a7d6071A12708c38a6fa0ED66469c |
| Attestation contract | https://mantlescan.xyz/address/0x89D3F83B777b245A80baec60277B449B8E72B5D3 |
| Agent EOA (decision tx stream) | https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c |
| ERC-8004 ReputationRegistry | https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 |

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

## License

MIT
