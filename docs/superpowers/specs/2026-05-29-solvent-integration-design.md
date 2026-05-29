# Solvent Integration Phase — Design Spec

**Design spec** · 2026-05-29 · Status: approved, pre-implementation
**Parent project:** Solvent (Mantle Turing Test hackathon 2026, Track 3 AI×RWA) — see `docs/superpowers/specs/2026-05-27-solvent-design.md`
**Dashboard design:** `docs/superpowers/specs/2026-05-28-solvent-dashboard-design.md`
**Hackathon deadline:** submission 2026-06-15, Demo Day 2026-07-02/03, winners 2026-07-10
**Plans this spec produces:** `docs/superpowers/plans/2026-05-29-solvent-integration-plan5-contracts.md`, `…-plan6-agent-live.md`, `…-plan7-dashboard-live.md`

---

## 1. One-paragraph summary

The integration phase converts Solvent from a mock-driven demonstrator (Plans 1–4 shipped) into a Mantle-deployed product. Three sub-plans, ~3-4 days each, ~10 days work plus ~7 days buffer to the deadline. **Plan 5** deploys asset-agnostic vault + Agni/INIT/ERC-8004 adapter contracts to Mantle mainnet. **Plan 6** wires real read/write adapters in the TypeScript agent, sets up a GitHub Actions cron that ticks every 5 min and writes ERC-8004 attestations, and builds a fork-replay script. **Plan 7** wires the dashboard to live wallet + on-chain reads via wagmi/ConnectKit, ships the interactive fork-replay viewer, and deploys to Vercel.

The demo story: **"Live agent on Mantle + fork-replay for depeg event."** Live mainnet artifact = a steady stream of ERC-8004 attestations on MantleScan from our agent identity, proving the guardian is alive. Fork-replay artifact = interactive scrubber on the dashboard showing the agent decisively bridging during a simulated UST-shape collapse. Two artifacts, one "Verifiable Guardian" narrative.

## 2. Demo scenario (LOCKED)

| Channel | Live mainnet | Fork-replay |
|---|---|---|
| Source of truth | Mantle mainnet RPC | Local anvil fork of Mantle |
| Agent reads | Real RWADynamicOracle / Agni / INIT / our vault | Same code, fork RPC |
| Agent writes | Real attestations to SolventAttestation + ERC-8004 ReputationRegistry | Same code, fork RPC |
| User deposits | Real ERC-20 approve + `SolventVault.deposit()` via ConnectKit wallet | n/a (demo only — agent acts on impersonated USDY) |
| Trigger condition | Reality (regime stays CALM most of the time) | Scripted: `anvil_setStorageAt` on RWADynamicOracle to simulate depeg |
| Judge-visible artifacts | MantleScan attestation log + Vercel-hosted live dashboard | Interactive replay panel on the same dashboard |

The fork-replay is the "what would happen during a depeg" story — runs in-browser via committed JSON snapshots produced by `agent/scripts/forkReplay.ts`. No live anvil at demo time; we ship a recording.

## 3. Asset strategy (LOCKED)

**SolventVault is asset-agnostic** — `(IERC20 riskAsset, IERC20 safeAsset, …)` constructor parameters. Two deployment configurations:

| Deploy | riskAsset | safeAsset | Whitelist required | When |
|---|---|---|---|---|
| **Deploy 1 (permissionless)** | USDT0 (`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`) | bridged USDC (`0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`) | No | First in Plan 5 |
| **Deploy 2 (USDY narrative)** | USDY (`0x5bE26527e817998A7206475496fDE1E68957c5A6`) | USDT0 or USDC | **Yes — Ondo Allowlist** | If allowlist arrives before deadline |

**Ondo USDY allowlist request** is filed off-chain on Day 1 (Plan 5 Task 1). Ondo whitelists smart contracts for legitimate DeFi integrations — the request includes hackathon context, vault address (predicted via `CREATE2` or queued for filing post-deploy), and use case. If granted within deadline, redeploy with USDY; if not, demo runs on USDT0. The fork-replay always uses USDY (impersonation bypasses allowlist on the fork).

**Why USDT0 as the live-demo risk asset:** it's Mantle-native canonical, permissionless, and matches the depeg-guardian thesis (USDT has its own depeg history; the guardian's CALM-regime behavior on USDT0 is structurally identical to USDY). The pitch alignment loss is recoverable in the fork-replay.

## 4. Action set (LOCKED)

Both **BRIDGE** and **SWAP** wired. The benchmark in Plan 3 already exercises both — we keep the architecture symmetric. Adapter selection on live Mantle naturally prefers BRIDGE due to thin DEX liquidity (the slippage cap blocks SWAP unless liquidity improves). In fork-replay, we control liquidity and can demonstrate both paths.

## 5. Tech stack (LOCKED)

| Component | Choice | Reason |
|---|---|---|
| Wallet UX | **wagmi + ConnectKit** | Mantle in default chain list, ~80-100 KB gzip, full WalletConnect v2, Static-export safe |
| Dashboard host | **Vercel** | 5-min zero-config deploy, free, preview URLs per branch |
| Agent host | **GitHub Actions cron** (`*/5 * * * *`) | Free, public audit log (verifiability bonus), no infrastructure |
| Agent key mgmt | `PRIVATE_KEY` in **GitHub Secrets** + local `.env` | Hackathon-appropriate; not custodial |
| ERC-8004 | Use **Mantle-deployed reference contracts** (not roll-our-own) | Aligns with Mantle's Feb 2026 "Internet of Agents" infra announcement |
| Indexer | **Direct viem event reads** (no subgraph) | YAGNI for this scale; revisit post-hackathon |
| IPFS pinning | **Pinata** (or `data:` URI fallback) | Free tier sufficient for attestation payload size |
| Mantle RPC | `https://rpc.mantle.xyz` (default), upgradeable via env | Sufficient for cron + demo load |

## 6. Mantle addresses (LOCKED references)

```
RISK ASSETS
  USDY                         0x5bE26527e817998A7206475496fDE1E68957c5A6
  mUSD (rebasing wrapper)      0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3
  USDT0 (canonical USDT)       0x779Ded0c9e1022225f8E0630b35a9b54bE713736
  USDC (bridged)               0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
  AUSD (permissionless RWA)    0x00000000efe302beaa2b3e6e1b18d08d69a9012a

ORACLES
  RWADynamicOracle             0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f

DEX (Agni Finance, Uniswap V3 fork)
  SwapRouter                   0x319B69888b0d11cEC22caA5034e25FfFBDc88421
  QuoterV2                     0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
  AgniFactory                  0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035
  USDY/USDT pool (active)      0xe38e3a804ef845e36f277d86fb2b24b8c32b3340

LENDING (INIT Capital)
  InitCore                     0x972BcB0284cca0152527c4f70f8F689852bCAFc5
  PosManager                   0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92
  Config                       0x007F91636E0f986068Ef27c950FA18734BA553Ac
  InitOracle                   0x4E195A32b2f6eBa9c4565bA49bef34F23c2C0350
  InitLens                     0x7d2b278b8ef87bEb83AeC01243ff2Fed57456042
  USDY Lending Pool            0xf084813F1be067d980a0171F067f084f27B3F63A
  USDC Lending Pool            0x00A55649E597d463fD212fBE48a3B40f0E227d06
  USDT Lending Pool            0xadA66a8722B5cdfe3bC504007A5d793e7100ad09

ERC-8004 (deployed Feb 2026 by Mantle as ecosystem infra)
  IdentityRegistry             0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
  ReputationRegistry           0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
  ValidationRegistry           (not yet deployed — spec WIP)

CHAIN
  Chain ID                     5000
  Native gas token             MNT
  Block time                   ~2 s
  RPC                          https://rpc.mantle.xyz
  Explorer                     https://mantlescan.xyz
```

These go into `contracts/script/MantleAddresses.sol` as a single source of truth.

## 7. Plan 5 — Contracts on Mantle (architecture)

### Files

```
contracts/src/
├── SolventVault.sol              refactor: asset-agnostic constructor params
├── SolventAttestation.sol        upgrade: dual-write to ERC-8004
├── interfaces/
│   ├── IRWAOracle.sol            NEW (thin wrapper interface)
│   ├── IDexAdapter.sol           (already exists from Plan 1)
│   └── ILendingVenue.sol         (already exists from Plan 1)
└── adapters/
    ├── AgniDexAdapter.sol        NEW (IDexAdapter implementation)
    └── InitLendingAdapter.sol    NEW (ILendingVenue implementation)

contracts/script/
├── MantleAddresses.sol           NEW (the address table from §6 as Solidity constants)
└── Deploy.s.sol                  refactor: takes addresses from MantleAddresses + env

contracts/test/
├── AgniDexAdapter.t.sol          NEW (mocked Agni + fork integration)
├── InitLendingAdapter.t.sol      NEW (mocked INIT + fork integration)
├── SolventAttestation.t.sol      add ERC-8004 dual-write tests
└── (existing tests updated for asset-agnostic vault)
```

### Component contracts

**`SolventVault`** — constructor signature:
```solidity
constructor(
    IERC20 riskAsset,
    IERC20 safeAsset,
    IRWAOracle navOracle,
    IDexAdapter dex,
    ILendingVenue lending,
    AgentPolicy policy,
    SolventAttestation attest,
    address agentOperator
)
```
Handlers (PARK/BRIDGE/SWAP/UNWIND) are already parametric in Plan 1 — the refactor surface area is the constructor + immutable storage slots; the action logic is unchanged.

**`AgniDexAdapter`** — implements `IDexAdapter`. Holds `IAgniSwapRouter` + `IAgniQuoterV2` + `pool` address (set per pair at deploy):
- `getMidPrice()` → `quoter.quoteExactInputSingle(riskAsset, safeAsset, fee, 1e18, 0)` → returns 18-dec price.
- `swap(amountIn, minAmountOut)` → `router.exactInputSingle({tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0})`.
- `getLiquidity()` → reads `slot0` + position liquidity for safety check.

**`InitLendingAdapter`** — implements `ILendingVenue`. Holds `InitCore` + `PosManager` + `Config` + `InitLens` addresses:
- `bridge(uint256 collateralAmount, uint256 borrowAmount)` → opens INIT position, posts riskAsset as collateral, borrows safeAsset. Returns `posId`.
- `unwind(uint256 posId, uint256 repayAmount)` → repays + withdraws.
- `getPositionValue(uint256 posId)` → reads `InitLens.getPosition` for health factor + collateral/debt.
- LTV / liquidation thresholds read on-chain from `Config.getCollateralCredit(riskAsset)` + `.getBorrowCredit(safeAsset)` — not hardcoded.

**`SolventAttestation` dual-write.** Existing `attest(payload)` keeps the rich internal log. New `attest` body additionally calls `ReputationRegistry.giveFeedback(agentId, score, tag, uri)` (or equivalent — verify ABI in Task 1 below). `score` is mapped from agent confidence; `tag` is a 32-byte reason code; `uri` is `ipfs://<CID>` or `data:application/json;base64,…` for the rich payload. Agent identity is registered once via `IdentityRegistry.register(…)` at deploy and stored in `SolventAttestation` as `immutable uint256 agentId`.

### Deploy strategy

1. Foundry script `Deploy.s.sol` reads from `MantleAddresses.sol` (Solidity constants).
2. Sequence: deploy `AgniDexAdapter` → `InitLendingAdapter` → `SolventAttestation` (registers agent identity inline) → `SolventVault` (linking all above) → set ownership/operator.
3. Verify each contract on MantleScan: `forge verify-contract --chain-id 5000 --etherscan-api-key $MANTLESCAN_KEY <address> src/<contract>.sol:<name>`.
4. Output deployment addresses to `contracts/deployments/mantle-mainnet.json` (committed for Plan 6/7 consumption).

### Pre-implementation verification

ERC-8004 reference ABI (`giveFeedback` exact signature, args, events) must be read from `github.com/erc-8004/erc-8004-contracts` BEFORE coding. Task 1 of Plan 5 = "verify ERC-8004 ABI + fix any signature mismatches in this spec".

### Testing

- ~15 new Foundry unit tests for adapters (mock upstream contracts).
- ~10 fork-integration tests using `--fork-url $MANTLE_RPC` against real Agni + real INIT (read-only paths) + real ERC-8004 (write to ReputationRegistry on fork).
- Existing tests updated for asset-agnostic vault refactor.
- Total target: **65+ Foundry tests** (39 baseline + 25 new) on Plan 5 merge.

## 8. Plan 6 — Agent live (architecture)

### Files

```
agent/src/
├── adapters/
│   ├── OndoNavSource.ts          NEW (viem read RWADynamicOracle)
│   ├── AgniDexSource.ts          NEW (viem read pool slot0 + QuoterV2 simulation)
│   ├── InitLendingSource.ts      NEW (viem read INIT position via InitLens)
│   ├── VaultPositionSource.ts    NEW (viem read SolventVault state)
│   ├── WriteClient.ts            rewrite (real WalletClient)
│   └── AttestationClient.ts      NEW (dual-write SolventAttest + ERC-8004 ReputationRegistry)
├── runtime/
│   ├── runTick.ts                refactor (single tick, idempotent, error-isolated)
│   └── main.ts                   NEW (CLI: --once for cron, --forever for local)
└── scripts/
    └── forkReplay.ts             NEW (anvil fork orchestrator)

.github/workflows/
└── agent-tick.yml                NEW (cron: */5 * * * *)
```

### Adapter shape

Every read adapter is a thin viem wrapper around one contract call. No caching, no retry — each tick reads fresh. Transient RPC failures bubble up; the cron run fails; the next cron run starts clean.

```typescript
// agent/src/adapters/OndoNavSource.ts
export class OndoNavSource implements NavSource {
  constructor(private client: PublicClient, private oracleAddr: Address) {}
  async getNav(): Promise<bigint> {
    return this.client.readContract({
      address: this.oracleAddr,
      abi: rwaDynamicOracleAbi,
      functionName: "getPrice",
    });
  }
}
```

Same shape for `AgniDexSource.getMidPrice/getLiquidity`, `InitLendingSource.getPosition`, `VaultPositionSource.getState`.

### Write path

`WriteClient` wraps viem `WalletClient` built from `privateKeyToAccount(PRIVATE_KEY)` on Mantle. `executeAction(plan)` switches on plan type (BRIDGE/SWAP/PARK/UNWIND), invokes the corresponding vault method, awaits `waitForTransactionReceipt`, returns receipt. Gas via `estimateContractGas` + 20% buffer. Idempotency via nonce management (default viem behavior is fine for single-tick-at-a-time cron).

`AttestationClient.dualWrite(payload)` flow:
1. Build rich JSON payload (tick number, signals, decision, regime, value, signature).
2. Pin to IPFS via Pinata API → get CID. If Pinata down or payload < 4KB, fallback to `data:application/json;base64,…` inline URI.
3. Call `SolventAttestation.attest(payload)` (which internally also calls ERC-8004 ReputationRegistry per Plan 5 dual-write design).
4. Return tx hash.

### runTick

```typescript
async function runTick(ctx: AgentContext): Promise<TickResult> {
  const signals = await gatherSignals(ctx.sources);
  const regime = assessRegime(signals, ctx.policy);
  const action = selectAction(regime, signals, ctx.policy, ctx.vaultPosition);
  const receipt = action.type === "PARK" ? null : await ctx.writeClient.executeAction(action);
  const attestTx = await ctx.attestClient.dualWrite({ tick, signals, regime, action, receipt });
  return { tick, regime, action, attestTx };
}
```

Each tick is independent. State lives on-chain (in the vault). No in-memory cache between ticks. This is what makes the cron job clean.

### GitHub Actions cron

```yaml
# .github/workflows/agent-tick.yml
name: agent-tick
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
concurrency:
  group: agent-tick
  cancel-in-progress: false
jobs:
  tick:
    runs-on: ubuntu-latest
    timeout-minutes: 4
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: cd agent && npm ci
      - run: cd agent && tsx src/runtime/main.ts --once
        env:
          PRIVATE_KEY: ${{ secrets.AGENT_PRIVATE_KEY }}
          MANTLE_RPC: ${{ secrets.MANTLE_RPC }}
          PINATA_JWT: ${{ secrets.PINATA_JWT }}
          VAULT_ADDRESS: ${{ vars.VAULT_ADDRESS }}
          ATTEST_ADDRESS: ${{ vars.ATTEST_ADDRESS }}
```

Public logs serve as the verifiability trail — anyone can audit what the agent saw and decided at each tick.

### Fork-replay

`agent/scripts/forkReplay.ts --scenario <name>`:
1. Spawn anvil: `anvil --fork-url $MANTLE_RPC --fork-block-number <pinned>` (background process via `child_process.spawn`).
2. Impersonate USDY-rich Mantle holder (top holders from MantleScan), transfer 10,000 USDY to test EOA via `anvil_impersonateAccount` + ERC-20 `transfer`.
3. Impersonate Agni LP, increase liquidity in USDY/USDT pool via direct mint to position NFT (or simpler: deploy a parallel Agni pool with our impersonation deepening liquidity).
4. Deploy contracts on fork (`forge script Deploy --rpc-url localhost:8545 --broadcast`).
5. Run scenario:
   - **transient-depeg**: tick 0 deposit USDY; tick 1-3 manipulate RWADynamicOracle via `anvil_setStorageAt` to depress price to $0.96; tick 4-7 recovery; agent reacts.
   - **terminal-collapse**: same start; depress to $0.50 by tick 4; no recovery; agent exits.
6. Record every tx + agent decision into `agent/replay-{scenario}.json`. This file is committed and used by Plan 7's `ForkReplay` dashboard component.

### Testing

- ~15 vitest unit tests for adapters (mock viem client).
- ~10 vitest integration tests against anvil-fork (real adapter behavior, no live mainnet dependency).
- 1 end-to-end fork-replay smoke test (run scenario, assert agent fired correctly).
- Existing 78 vitest tests stay green (existing logic untouched).
- Target: **~100 vitest tests** on Plan 6 merge.

## 9. Plan 7 — Dashboard live + hosting + demo (architecture)

### Files

```
web/src/
├── app/
│   ├── layout.tsx              add WagmiProvider + ConnectKitProvider + QueryClient
│   └── app/page.tsx            refactor: live hooks replace mockVault
├── components/
│   ├── OnboardingFlow.tsx      real ConnectKit button + real deposit tx flow
│   ├── ChartPanel.tsx          interactive (hover crosshair + tick details overlay)
│   ├── ForkReplay.tsx          renamed from BenchmarkReplay; scenario picker + scrubber + play/pause
│   ├── DecisionLog.tsx         reads live events from ERC-8004 ReputationRegistry
│   └── HeroStat.tsx            reads live vault state
└── lib/
    ├── wagmi.ts                NEW (mantle chain config, ConnectKit theme tuned to Schematic Blueprint palette)
    ├── contracts.ts            NEW (deployment addresses + ABIs imported from agent/abis/)
    ├── ipfs.ts                 NEW (URI resolver: ipfs:// → pinata gateway, data: → inline parse)
    └── hooks/
        ├── useVaultState.ts    useReadContracts batch, refetchInterval: 12s
        ├── usePolicy.ts        single useReadContract
        ├── useDecisionLog.ts   useWatchContractEvent on ReputationRegistry filtered by agentId
        ├── useOraclePrice.ts   useReadContract RWADynamicOracle.getPrice
        ├── useDexPrice.ts      useReadContract Agni QuoterV2.quoteExactInputSingle
        └── useDeposit.ts       compose: useReadContract allowance → useWriteContract approve → useWriteContract deposit

web/public/
├── replay-transient-depeg.json     committed snapshot from Plan 6 fork-replay
├── replay-terminal-collapse.json   committed snapshot from Plan 6 fork-replay
└── benchmark-report.json           refresh from agent/benchmark-report.json
```

### Live read pattern

```typescript
// web/src/lib/hooks/useVaultState.ts
export function useVaultState() {
  return useReadContracts({
    contracts: [
      { address: VAULT, abi: vaultAbi, functionName: "totalAssets" },
      { address: VAULT, abi: vaultAbi, functionName: "regime" },
      { address: VAULT, abi: vaultAbi, functionName: "lastTickTimestamp" },
      { address: VAULT, abi: vaultAbi, functionName: "attestationsCount" },
      { address: VAULT, abi: vaultAbi, functionName: "currentPosition" },
    ],
    query: { refetchInterval: 12_000 }, // 6 Mantle blocks
  });
}
```

### Real deposit flow

`OnboardingFlow.tsx` after preset+amount selection:
1. `useReadContract` ERC-20 `allowance(user, vault)`.
2. If allowance < amount → `useWriteContract` ERC-20 `approve(vault, amount)`. Show pending UI with tx hash linkable to MantleScan.
3. After approve confirmation → `useWriteContract` `SolventVault.deposit(amount)`. Same pending UI pattern.
4. On success → invalidate `useVaultState` query → dashboard transitions to post-deposit bento view automatically.

### Live decision log

`useDecisionLog`:
1. `useWatchContractEvent` subscribed to `ReputationRegistry.FeedbackGiven` filtered by our `agentId`.
2. For each event: resolve `uri` via `lib/ipfs.ts`. Cache parsed JSON in React Query (60s TTL).
3. Returns last 5 enriched entries to `DecisionLog` component, which renders them with the same visual logic as Plan 4 (amber observe row, etc.).
4. "Full log →" link opens a modal/page showing all attestations to date.

### ForkReplay component

- Scenario picker (radio): `transient-depeg` / `terminal-collapse`.
- Loads `/replay-${scenario}.json` (static, in `web/public/`).
- Scrubber slider under chart; play/pause button auto-advances 1 tick/sec.
- Tick state panel: regime / action / value / clickable tx-hash → MantleScan (or local fork explorer if we ship one; otherwise display only).
- Interactive overlay sticks to scrub position on the chart.
- This is the demo centerpiece.

### Wagmi config

```typescript
// web/src/lib/wagmi.ts
import { mantle } from "viem/chains";
import { http, createConfig } from "wagmi";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

export const config = createConfig({
  chains: [mantle],
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
    coinbaseWallet({ appName: "Solvent" }),
  ],
  transports: { [mantle.id]: http(process.env.NEXT_PUBLIC_MANTLE_RPC) },
});
```

ConnectKit theme inherits the Schematic Blueprint palette via CSS variable overrides — see Plan 7 task for the exact CSS mapping.

### Hosting

- Vercel project linked to GitHub repo `master` branch.
- Build command: `cd web && npm run build`. Output dir: `web/out` (static export).
- Env vars: `NEXT_PUBLIC_MANTLE_RPC`, `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_ATTEST_ADDRESS`, `NEXT_PUBLIC_AGENT_ID`, `NEXT_PUBLIC_WC_PROJECT_ID`.
- Auto-deploy on push to master; preview URL per PR.
- Custom domain: optional, only if time permits. Default `solvent-mantle.vercel.app`-style URL.

### Demo materials

- **`README.md`** at repo root: project pitch (3 paragraphs), live URL, architecture diagram (ascii), run instructions for each subsystem (contracts/agent/web), submission links.
- **`docs/demo-script.md`**: 5-min pitch with timing (intro 30s / problem 60s / fork-replay walkthrough 90s / live agent + MantleScan 90s / pitch close 30s).
- **3-4 screenshots** of the dashboard for the hackathon submission form.

## 10. Out of scope

Deferred to post-hackathon follow-up:
- Subgraph indexer (we read events directly via viem — sufficient at this scale).
- Production-grade key management (HSM / KMS).
- Multi-chain deployment (Mantle-only).
- Mobile-first dashboard design (current is responsive but desktop-first).
- Real liquidity provisioning on Agni USDY pools (we accept thin liquidity as a fact).
- ERC-8004 ValidationRegistry integration (not yet deployed on Mantle).
- Optimistic UX (we wait for tx confirmations).
- Demo video (only if time permits; not blocking).

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Ondo allowlist doesn't arrive in time | Medium | Low (asset-agnostic vault means USDT0 fallback works) | File request Day 1; design assumes fallback |
| Agni Mantle USDY pool too thin for any swap | High | Low | BRIDGE path is primary; SWAP gated by slippage cap |
| INIT USDY pool insufficient for borrow | Medium | Medium | Sized demo positions small ($100s); pre-validate via `InitLens.getCollateralCredit` at deploy |
| Mantle RPC rate limits | Medium | Medium | Vercel + GH Actions traffic is modest; have Alchemy/Infura fallback ready |
| ERC-8004 reference ABI mismatches spec | Medium | Low | Task 1 of Plan 5 verifies actual ABI before any code |
| Fork-replay anvil setup is fragile on Windows | Medium | Medium | Develop fork-replay on WSL or Linux; ship recorded JSON, not live anvil at demo time |
| Vercel build fails for some Next.js / wagmi quirk | Low | High | Test deploy in Plan 7 Task 1 (before any feature wiring); known issue patterns documented in ConnectKit Next.js docs |
| Agent wallet runs out of MNT mid-demo | Low | High | Fund with 0.5 MNT (~$5) upfront; monitor balance; cron job logs balance |
| ERC-8004 ReputationRegistry write fails | Low | Medium | Dual-write is atomic in `SolventAttestation`; if external write reverts, internal log still captures; `try/catch` in adapter wraps the external call |

## 12. Sub-plan summaries

### Plan 5: Contracts on Mantle
**Deliverable:** Deployed and verified `SolventVault` + `SolventAttestation` + `AgniDexAdapter` + `InitLendingAdapter` on Mantle mainnet. `MantleAddresses.sol` + `contracts/deployments/mantle-mainnet.json` committed. ~65 Foundry tests green. Ondo allowlist request filed.

### Plan 6: Agent live
**Deliverable:** Real read adapters, real WriteClient, real AttestationClient, GitHub Actions cron tick every 5 min on master. Agent identity registered in ERC-8004 IdentityRegistry. Fork-replay scripts producing `replay-{transient,terminal}.json`. ~100 vitest tests green.

### Plan 7: Dashboard live + hosting + demo
**Deliverable:** Vercel-deployed dashboard with ConnectKit wallet, live reads, real deposit flow, live ERC-8004 decision log, interactive ForkReplay component. README + demo script + screenshots committed. Custom domain optional.

## 13. References

- Parent design spec: `docs/superpowers/specs/2026-05-27-solvent-design.md`
- Dashboard design spec: `docs/superpowers/specs/2026-05-28-solvent-dashboard-design.md`
- Plan 1 (contracts baseline): `docs/superpowers/plans/2026-05-27-solvent-contracts.md`
- Plan 2 (agent baseline): `docs/superpowers/plans/2026-05-27-solvent-agent.md`
- Plan 3 (benchmark): `docs/superpowers/plans/2026-05-28-solvent-benchmark.md`
- Plan 4 (dashboard): `docs/superpowers/plans/2026-05-28-solvent-dashboard.md`
- Ondo USDY addresses: https://docs.ondo.finance/addresses
- Ondo Mantle integration guide: https://docs.ondo.finance/developer-guides/mantle-integration-guidelines
- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- ERC-8004 reference contracts: https://github.com/erc-8004/erc-8004-contracts
- Mantle ERC-8004 deployment announcement: https://chainwire.org/2026/02/16/mantle-unlocks-autonomous-economy-with-erc-8004-deployment/
- Agni Finance contracts: https://github.com/agni-protocol/contracts/blob/main/deployments/mantleMainnet.json
- INIT Capital developer docs: https://dev.init.capital/contract-addresses/mantle
- USDT0 docs: https://docs.usdt0.to/technical-documentation/deployments
- ConnectKit chains: https://family.co/docs/connectkit/chains
- Vercel pricing: https://vercel.com/pricing
