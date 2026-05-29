# Solvent Plan 7 — Dashboard Live + Vercel + Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's mock data layer (Plan 4) with live wagmi+ConnectKit reads against the deployed Mantle contracts (Plans 5+6), ship the interactive ForkReplay component, deploy to Vercel, and write the demo materials. This is the final sub-plan of the integration phase — Plan 7 merge means the project is submission-ready.

**Architecture:** Static-exported Next.js 15 app on Vercel. wagmi 2.x + viem 2.x wraps app in `WagmiProvider` + `ConnectKitProvider` + `QueryClientProvider`. Per-concern hooks under `web/src/lib/hooks/` use `useReadContracts` (batch) / `useReadContract` (single) with `refetchInterval: 12_000` (≈ 6 Mantle blocks). Live ERC-8004 attestation stream via `useWatchContractEvent` filtered by agentId 106; rich JSON resolved through Pinata gateway. Real ERC-20 approve→deposit flow via `useWriteContract`. Fork-replay JSON snapshots (built by Plan 6) live in `web/public/` and drive a scrubber+player UI.

**Tech Stack:** Next.js 15 (static export) · React 19 · wagmi ^2.12 · viem ^2.21 · @tanstack/react-query ^5.59 · connectkit ^1.8 · vitest 4 + @testing-library/react · Vercel.

---

## Pre-implementation context

**Repo state:** `master @ a028369` (Plan 6 hourly cron live). Public repo `https://github.com/RaYYeR220/solvent`. Plans 1–6 complete: contracts deployed and verified on Mantle, agent runs hourly via GH Actions, agent EOA = `0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c`, fork-replay JSONs committed at `agent/replay-{transient,terminal}.json`.

**Deployed addresses (`contracts/deployments/mantle-mainnet.json`):**

| Name | Address |
|---|---|
| SolventVault | `0x06513470e16a7d6071A12708c38a6fa0ED66469c` |
| SolventAttestation | `0x89D3F83B777b245A80baec60277B449B8E72B5D3` |
| ERC-8004 ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| RWADynamicOracle (USDY NAV) | `0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f` |
| Agni QuoterV2 | `0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb` |
| Vault asset (USDT0) | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` |
| Safe asset (USDC) | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` |
| Agent EOA | `0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c` |
| agentId | 106 |

**ABIs** are exported as JSON in `contracts/exports/abis/`: `SolventVault.json`, `SolventAttestation.json`, `AgniDexAdapter.json`, `InitLendingAdapter.json`. Plan 7 imports these via Next.js JSON import (no extra build step).

**Verified ERC-8004 FeedbackGiven event topic (sampled from live logs):** `0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc`. Task 5 verifies the exact event signature against this hash before writing the hook.

**Existing `web/` state (from Plan 4):**

```
web/
├── package.json              (Next.js 15, React 19, Tailwind 4; NO wagmi/viem yet)
├── next.config.ts            (output: "export", trailingSlash: false)
├── public/
│   └── benchmark-report.json (from Plan 3)
├── src/
│   ├── app/
│   │   ├── layout.tsx        (basic; will wrap with providers)
│   │   ├── page.tsx          (landing)
│   │   └── app/page.tsx      (dashboard, uses mockData)
│   ├── components/           (BrandMark, ChartPanel, DashboardFrame, DecisionLog,
│   │                          Footer, Header, HeroStat, HowItWorks, LandingFrame,
│   │                          OnboardingFlow, Panel, PolicyPanel, PresetPicker,
│   │                          SchematicBackground, Scoreboard, BenchmarkReplay)
│   └── lib/
│       ├── benchmark.server.ts
│       ├── benchmark.ts
│       └── mockData.ts       (mockVault, mockPolicy, mockLog, PRESETS — to be retired)
└── test/                     (29 vitest tests in jsdom; component tests use
                                @testing-library/react)
```

**Visual identity** (locked by Plan 4 spec): "Schematic Blueprint". Navy `#0a1932` background, cyan `#7cd5ff` accent, mono labels in JetBrains Mono. CSS variables `--ink-cyan`, `--ink-cyan-bright`, `--text-muted`, `--text-strong`, `--warm-gold` defined in `src/app/globals.css`.

**Existing mockData types** (will be the shape live hooks return, slightly adapted):
- `VaultState`: `{protectedPositionUsd, usdyBalance, entryUsd, deltaPct, marketPrice, navPrice, spreadBps, regime: "CALM"|"EARLY"|"TERMINAL", divergenceBps, tickLabel, attestationsAttested, attestationsTotal, address, asset, network, agentRevision, drawingId}`
- `PolicyView`: `{earlyTrigBps, termTrigBps, maxLtvPct, safeAsset, slippageCapBps}`
- `LogEntry`: `{timestamp, reasonCode, description, txShort}`
- `PolicyPreset`: `{id: "aggressive"|"balanced"|"terminal-only", ...}`

**User-action gates** (subagents cannot do these — escalate to user when reached):
- Task 1 Step 1.2: WalletConnect Cloud project — user creates at https://cloud.walletconnect.com (free), pastes Project ID into `web/.env.local`.
- Task 10 Step 10.5: Vercel project — user goes to https://vercel.com/new, imports repo, configures root dir + env vars.
- Task 10 Steps 10.7–10.9: take 4 dashboard screenshots after Vercel deploy is live; place into `web/public/screenshots/`.

**File structure produced by this plan** (NEW files):

```
web/
├── src/
│   ├── lib/
│   │   ├── wagmi.ts                       NEW (chain config, connectors)
│   │   ├── contracts.ts                   NEW (addresses + ABI re-exports)
│   │   ├── ipfs.ts                        NEW (URI resolver)
│   │   ├── providers.tsx                  NEW (client-side provider tree wrapper)
│   │   └── hooks/
│   │       ├── useVaultState.ts           NEW (totalAssets+agent+agentId+killSwitch batch)
│   │       ├── usePolicy.ts               NEW (vault.policy struct)
│   │       ├── useOraclePrice.ts          NEW (RWADynamicOracle, constant fallback)
│   │       ├── useDexPrice.ts             NEW (Agni QuoterV2, revert-tolerant)
│   │       ├── useDecisionLog.ts          NEW (ERC-8004 FeedbackGiven, IPFS-enriched)
│   │       └── useDeposit.ts              NEW (allowance + approve + deposit composed)
│   ├── components/
│   │   ├── ForkReplay.tsx                 NEW (replaces BenchmarkReplay; scenario picker + scrubber)
│   │   ├── HeroStat.tsx                   MODIFIED (live VaultState)
│   │   ├── PolicyPanel.tsx                MODIFIED (live PolicyView)
│   │   ├── DecisionLog.tsx                MODIFIED (live entries)
│   │   ├── OnboardingFlow.tsx             REWRITTEN (real ConnectKit + deposit flow)
│   │   └── ChartPanel.tsx                 MODIFIED (interactive hover overlay)
│   └── app/
│       ├── layout.tsx                     MODIFIED (wrap with providers)
│       └── app/page.tsx                   REWRITTEN (live hooks instead of mock)
├── public/
│   ├── replay-transient.json              NEW (copy from agent/replay-transient.json)
│   ├── replay-terminal.json               NEW (copy from agent/replay-terminal.json)
│   └── screenshots/                       NEW (4 dashboard screenshots for submission)
├── .env.local.example                     NEW (template)
├── vercel.json                            NEW (build config for repo root)
└── package.json                           MODIFIED (add wagmi/viem/connectkit/react-query)

Repo root:
├── README.md                              REWRITTEN (project pitch + live URL + diagram)
└── docs/
    └── demo-script.md                     NEW (5-minute pitch script)

agent/test/scripts/  (no change — replay JSONs sourced from agent/)
contracts/           (no change — Plan 7 is dashboard-only)
```

**Tests added (~35 new vitest tests; target ~64 total = 29 baseline + 35 new):**
- lib/ipfs.test.ts (3 tests)
- lib/contracts.test.ts (2 tests)
- hooks/*.test.ts (~12 tests across 6 hook files)
- components/ForkReplay.test.tsx (5 tests)
- components/HeroStat.test.tsx (updated, 1 test)
- components/DecisionLog.test.tsx (updated, 2 tests)
- components/OnboardingFlow.test.tsx (new, 4 tests)
- providers smoke test (1 test)
- Wagmi/ConnectKit integration mocks (in vitest setup, ~5 mock files)

---

## Task 0: Branch setup

**Files:** none (git only).

- [ ] **Step 0.1: Create plan-7-dashboard branch**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
git checkout master
git pull origin master
git checkout -b plan-7-dashboard
git log -1 --oneline
```

Expected: HEAD is `a028369 chore(ci): hourly cron + ops cookbook ...` (or later if more was merged).

---

## Task 1: Install dependencies + WalletConnect project ID gate

**Goal:** Add wagmi/viem/connectkit/react-query to `web/`, capture the user's WalletConnect Cloud project ID into `web/.env.local`.

**Files:**
- Modify: `web/package.json` (deps)
- Create: `web/.env.local.example`

**User-action gate:** Step 1.2 — user must create WalletConnect project and provide the project ID.

- [ ] **Step 1.1: Install new dependencies**

```bash
cd web
npm install wagmi@^2.12.0 viem@^2.21.0 @tanstack/react-query@^5.59.0 connectkit@^1.8.2
```

Expected: `package.json` gains four new entries under `dependencies`. `package-lock.json` updates. No vulnerability warnings beyond the existing baseline.

- [ ] **Step 1.2: USER ACTION — get WalletConnect project ID**

STOP. Surface to the user:

> **Action required:** Create a free WalletConnect Cloud project to get a project ID (needed for WalletConnect v2 connector).
>
> 1. Go to https://cloud.walletconnect.com and log in / sign up.
> 2. Click **Create project** → name it "Solvent" → set Type = "App" → set Homepage URL = `https://github.com/RaYYeR220/solvent` (or leave blank, can update later).
> 3. Copy the **Project ID** (a 32-char hex string).
> 4. Share it with the controller. The controller will create `web/.env.local` with the value (this file is gitignored).

Wait for the user to confirm and share the project ID.

- [ ] **Step 1.3: Create web/.env.local.example template**

Write `web/.env.local.example`:

```
# Public env vars for the dashboard. Vercel injects production values via its
# UI; local dev uses `web/.env.local` (gitignored — copy from this template and
# fill in NEXT_PUBLIC_WC_PROJECT_ID from https://cloud.walletconnect.com).
#
# Next.js exposes only NEXT_PUBLIC_*-prefixed env vars to the browser.

NEXT_PUBLIC_MANTLE_RPC=https://rpc.mantle.xyz
NEXT_PUBLIC_VAULT_ADDRESS=0x06513470e16a7d6071A12708c38a6fa0ED66469c
NEXT_PUBLIC_ATTEST_ADDRESS=0x89D3F83B777b245A80baec60277B449B8E72B5D3
NEXT_PUBLIC_REP_REGISTRY=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
NEXT_PUBLIC_AGENT_ID=106
NEXT_PUBLIC_ASSET_ADDRESS=0x779Ded0c9e1022225f8E0630b35a9b54bE713736
NEXT_PUBLIC_SAFE_ASSET_ADDRESS=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
NEXT_PUBLIC_MANTLESCAN_URL=https://mantlescan.xyz

# REPLACE with your WalletConnect Cloud project ID:
NEXT_PUBLIC_WC_PROJECT_ID=
```

Verify `.env.local.example` is committed but `.env.local` itself is gitignored: check `web/.gitignore` or repo `.gitignore` for `.env*` rule.

- [ ] **Step 1.4: Create web/.env.local from template**

After user shares the project ID, copy template and fill in:

```bash
cd web
cp .env.local.example .env.local
# Edit .env.local — replace NEXT_PUBLIC_WC_PROJECT_ID= with the user's ID
```

Verify: `cat web/.env.local` shows the filled value. Do NOT commit this file.

- [ ] **Step 1.5: Smoke-test that Next.js picks up env vars**

```bash
cd web && node -e "import('dotenv').then(d => { d.config({ path: '.env.local' }); console.log('WC project id present:', !!process.env.NEXT_PUBLIC_WC_PROJECT_ID); })" 2>&1 || true
# If `dotenv` isn't installed, simpler check:
grep "NEXT_PUBLIC_WC_PROJECT_ID=" web/.env.local | head -1
```

Expected: shows the line with a non-empty value (anything except an empty `=`).

- [ ] **Step 1.6: Commit**

```bash
git add web/package.json web/package-lock.json web/.env.local.example
git commit -m "feat(web): add wagmi/viem/connectkit/@tanstack/react-query + .env.local.example"
```

---

## Task 2: Foundation libs — wagmi config + contracts + ipfs resolver

**Goal:** Three thin foundation modules that the hooks build on.

**Files:**
- Create: `web/src/lib/wagmi.ts`
- Create: `web/src/lib/contracts.ts`
- Create: `web/src/lib/ipfs.ts`
- Test: `web/test/lib/contracts.test.ts`
- Test: `web/test/lib/ipfs.test.ts`

- [ ] **Step 2.1: Write the contracts test (TDD)**

Create `web/test/lib/contracts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CONTRACTS, vaultAbi, attestationAbi, reputationRegistryAbi } from "../../src/lib/contracts";

describe("CONTRACTS", () => {
  it("exposes Mantle-deployed addresses", () => {
    expect(CONTRACTS.vault).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(CONTRACTS.attestation).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(CONTRACTS.reputationRegistry).toBe("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63");
    expect(CONTRACTS.agentId).toBe(106n);
  });

  it("vault and attestation ABIs include the expected functions", () => {
    const vaultFnNames = (vaultAbi as any[]).filter(e => e.type === "function").map(e => e.name);
    expect(vaultFnNames).toContain("totalAssets") || expect(vaultFnNames).toContain("asset");
    expect(vaultFnNames).toContain("agent");
    expect(vaultFnNames).toContain("policy");
    expect(vaultFnNames).toContain("deposit");

    const attestFnNames = (attestationAbi as any[]).filter(e => e.type === "function").map(e => e.name);
    expect(attestFnNames).toContain("record");

    const repEvents = (reputationRegistryAbi as any[]).filter(e => e.type === "event").map(e => e.name);
    expect(repEvents).toContain("FeedbackGiven");
  });
});
```

- [ ] **Step 2.2: Run the test (expect fail)**

```bash
cd web && npx vitest run test/lib/contracts.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 2.3: Implement contracts.ts**

Plan 7's source-of-truth for deployed addresses + ABI imports. The SolventVault + SolventAttestation + AgniDexAdapter + InitLendingAdapter JSON ABIs are imported from `contracts/exports/abis/`; the ERC-8004 ReputationRegistry minimal ABI is inlined (only the subset we need — see Task 5 for verification of the event signature).

Create `web/src/lib/contracts.ts`:

```typescript
import vaultAbiJson from "../../../contracts/exports/abis/SolventVault.json" with { type: "json" };
import attestationAbiJson from "../../../contracts/exports/abis/SolventAttestation.json" with { type: "json" };

export const CONTRACTS = {
  vault: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x06513470e16a7d6071A12708c38a6fa0ED66469c") as `0x${string}`,
  attestation: (process.env.NEXT_PUBLIC_ATTEST_ADDRESS ?? "0x89D3F83B777b245A80baec60277B449B8E72B5D3") as `0x${string}`,
  reputationRegistry: (process.env.NEXT_PUBLIC_REP_REGISTRY ?? "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63") as `0x${string}`,
  asset: (process.env.NEXT_PUBLIC_ASSET_ADDRESS ?? "0x779Ded0c9e1022225f8E0630b35a9b54bE713736") as `0x${string}`,
  safeAsset: (process.env.NEXT_PUBLIC_SAFE_ASSET_ADDRESS ?? "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9") as `0x${string}`,
  oracle: "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f" as `0x${string}`,
  quoter: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb" as `0x${string}`,
  agentId: BigInt(process.env.NEXT_PUBLIC_AGENT_ID ?? "106"),
};

export const vaultAbi = vaultAbiJson as any;
export const attestationAbi = attestationAbiJson as any;

// ERC-8004 ReputationRegistry — minimal subset (FeedbackGiven event + giveFeedback).
// Event signature is verified in Task 5 against live-log topic
// 0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc.
export const reputationRegistryAbi = [
  {
    type: "event",
    name: "FeedbackGiven",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: true },
    ],
  },
] as const;

// Minimal ERC-20 ABI used by useDeposit and the asset balance read.
export const erc20Abi = [
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const rwaOracleAbi = [
  { type: "function", name: "getPrice", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const quoterV2Abi = [
  { type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
    inputs: [{ type: "tuple", name: "params", components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ]}],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
```

Note: the `with { type: "json" }` import attribute is Next.js 15 + Node 22+ syntax (works in our build environment). If the import fails in vitest's transform, fall back to `import vaultAbiJson from "../../../contracts/exports/abis/SolventVault.json";` (no attribute) — vitest's vite config handles JSON imports natively.

- [ ] **Step 2.4: Run the test (expect pass)**

```bash
cd web && npx vitest run test/lib/contracts.test.ts
```

Expected: 2/2 pass. If the JSON import attribute throws, switch to the no-attribute import and re-run.

- [ ] **Step 2.5: Write ipfs.ts test (TDD)**

Create `web/test/lib/ipfs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveUri } from "../../src/lib/ipfs";

describe("resolveUri", () => {
  it("rewrites ipfs:// URIs to the Pinata gateway", () => {
    expect(resolveUri("ipfs://QmTEST")).toBe("https://gateway.pinata.cloud/ipfs/QmTEST");
  });

  it("decodes data:application/json;base64,... URIs to inline JSON", async () => {
    const json = '{"hello":"world"}';
    const dataUri = "data:application/json;base64," + Buffer.from(json, "utf8").toString("base64");
    expect(resolveUri(dataUri)).toBe(dataUri);
  });

  it("returns http(s) URIs unchanged", () => {
    expect(resolveUri("https://example.com/payload.json")).toBe("https://example.com/payload.json");
  });
});
```

- [ ] **Step 2.6: Implement ipfs.ts**

Create `web/src/lib/ipfs.ts`:

```typescript
/** Convert any on-chain attestation URI into a browser-fetchable URL.
 *  - `ipfs://<cid>` → `<gateway>/ipfs/<cid>` (Pinata public gateway by default).
 *  - `data:...`     → returned unchanged (browsers fetch data URIs directly).
 *  - `http(s)://`   → returned unchanged. */
export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice("ipfs://".length);
    const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
    return `${gateway}/ipfs/${cid}`;
  }
  return uri;
}

/** Fetch the JSON payload behind any attestation URI. The dashboard wraps this
 *  in React Query (60s TTL) so repeat resolutions of the same URI cost nothing. */
export async function fetchAttestationJson(uri: string): Promise<unknown> {
  const url = resolveUri(uri);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchAttestationJson ${res.status}: ${url}`);
  return res.json();
}
```

- [ ] **Step 2.7: Run ipfs test (expect pass)**

```bash
cd web && npx vitest run test/lib/ipfs.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 2.8: Implement wagmi.ts**

Create `web/src/lib/wagmi.ts`:

```typescript
import { http, createConfig } from "wagmi";
import { mantle } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_MANTLE_RPC ?? "https://rpc.mantle.xyz";
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

if (typeof window !== "undefined" && !wcProjectId) {
  console.warn(
    "Solvent: NEXT_PUBLIC_WC_PROJECT_ID is empty — WalletConnect will fail. " +
    "Create a project at https://cloud.walletconnect.com and set the env var.",
  );
}

export const wagmiConfig = createConfig({
  chains: [mantle],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: wcProjectId, showQrModal: false }),
    coinbaseWallet({ appName: "Solvent" }),
  ],
  transports: { [mantle.id]: http(rpcUrl) },
  ssr: true,
});

/** ConnectKit theme variables tuned to the Schematic Blueprint palette.
 *  Variable names are from https://docs.family.co/connectkit/theming. */
export const connectKitCustomTheme = {
  "--ck-font-family": "var(--font-mono), monospace",
  "--ck-border-radius": "2px",
  "--ck-overlay-background": "rgba(10, 25, 50, 0.85)",
  "--ck-body-background": "#0a1932",
  "--ck-body-background-secondary": "#0e2342",
  "--ck-body-color": "#cfe7ff",
  "--ck-body-color-muted": "rgba(207, 231, 255, 0.55)",
  "--ck-primary-button-background": "#0a1932",
  "--ck-primary-button-color": "#7cd5ff",
  "--ck-primary-button-border-color": "#7cd5ff",
  "--ck-primary-button-hover-background": "rgba(124, 213, 255, 0.08)",
  "--ck-focus-color": "#7cd5ff",
};
```

- [ ] **Step 2.9: Run full suite + typecheck**

```bash
cd web && npx vitest run && npx tsc --noEmit
```

Expected: existing 29 tests + new 5 (3 ipfs + 2 contracts) = 34 pass. tsc clean.

- [ ] **Step 2.10: Commit foundation libs**

```bash
git add web/src/lib/wagmi.ts web/src/lib/contracts.ts web/src/lib/ipfs.ts web/test/lib/
git commit -m "feat(web): foundation libs — wagmi config + contracts ABI re-exports + ipfs resolver"
```

---

## Task 3: Providers wrapper + layout.tsx wiring

**Goal:** Wrap the app in `WagmiProvider` + `QueryClientProvider` + `ConnectKitProvider`. The providers need to be in a Client Component because they use React Context; isolate that in `web/src/lib/providers.tsx` and import it into `layout.tsx`.

**Files:**
- Create: `web/src/lib/providers.tsx`
- Modify: `web/src/app/layout.tsx`
- Test: `web/test/lib/providers.test.tsx`

- [ ] **Step 3.1: Write providers smoke test**

Create `web/test/lib/providers.test.tsx`:

```typescript
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Providers } from "../../src/lib/providers";

describe("Providers", () => {
  it("renders children inside the provider tree without throwing", () => {
    const { getByText } = render(
      <Providers>
        <div>solvent</div>
      </Providers>,
    );
    expect(getByText("solvent")).toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run test (expect fail)**

```bash
cd web && npx vitest run test/lib/providers.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3.3: Implement Providers**

Create `web/src/lib/providers.tsx`:

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ConnectKitProvider } from "connectkit";
import { useState, type ReactNode } from "react";
import { wagmiConfig, connectKitCustomTheme } from "./wagmi";

/** Single client-side provider tree the dashboard uses. Imported into the
 *  Next.js root `layout.tsx` as a wrapper around `{children}` — keeps the
 *  layout otherwise server-rendered. */
export function Providers({ children }: { children: ReactNode }) {
  // Create the QueryClient once per browser session.
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          // Match agent's 5-min cron cadence with a 60s default staleTime —
          // hook-specific overrides set their own refetchInterval.
          staleTime: 60_000,
          refetchOnWindowFocus: false,
        },
      },
    }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider customTheme={connectKitCustomTheme} options={{ initialChainId: 5000 }}>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 3.4: Wire Providers into layout.tsx**

Replace `web/src/app/layout.tsx` entirely with:

```typescript
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Solvent — Autonomous depeg guardian",
  description: "AI-driven RWA depeg protection on Mantle. Verifiable. Always-on.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3.5: Run providers test (expect pass)**

```bash
cd web && npx vitest run test/lib/providers.test.tsx
```

Expected: 1/1 pass.

- [ ] **Step 3.6: Smoke-test the dev build**

```bash
cd web && npm run build 2>&1 | tail -20
```

Expected: build completes without "wagmi cannot be used in server components" or similar errors. Some warnings about missing browser globals during SSR are acceptable (we're statically exporting, so client-only hooks lazy-mount).

If the build fails with "useContext is not a function" or similar, the most likely fix is to mark a component as `"use client"`. The Providers component is already `"use client"`, but if it's imported into a server component that's still rendered server-side, double-check the import chain.

- [ ] **Step 3.7: Commit providers**

```bash
git add web/src/lib/providers.tsx web/src/app/layout.tsx web/test/lib/providers.test.tsx
git commit -m "feat(web): WagmiProvider + QueryClient + ConnectKit theme wrapper in root layout"
```

---

## Task 4: Read hooks — useVaultState, usePolicy, useOraclePrice, useDexPrice

**Goal:** Four hooks that wrap viem reads. All return shapes compatible with the existing `VaultState` / `PolicyView` types from `mockData.ts` so component swap-in is mechanical.

**Files:**
- Create: `web/src/lib/hooks/useVaultState.ts`
- Create: `web/src/lib/hooks/usePolicy.ts`
- Create: `web/src/lib/hooks/useOraclePrice.ts`
- Create: `web/src/lib/hooks/useDexPrice.ts`
- Tests: matching `.test.ts` files under `web/test/lib/hooks/`

- [ ] **Step 4.1: Write useVaultState test (TDD)**

Create `web/test/lib/hooks/useVaultState.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", async () => {
  return {
    useReadContracts: vi.fn().mockReturnValue({
      data: [
        { status: "success", result: 1_500_000_000n },  // asset balance probe placeholder; replaced below
      ],
      isLoading: false,
      isError: false,
    }),
    useReadContract: vi.fn().mockReturnValue({
      data: 5_000_000_000n, // ERC20 balanceOf for the vault: 5000 units of USDT0 (6 dec)
      isLoading: false,
      isError: false,
    }),
  };
});

import { useVaultState } from "../../../src/lib/hooks/useVaultState";

describe("useVaultState", () => {
  it("returns a vault state shape compatible with VaultState", () => {
    const { result } = renderHook(() => useVaultState());
    expect(result.current).toBeDefined();
    expect(result.current.address).toMatch(/^0x[a-fA-F0-9]{4}/);
  });
});
```

Note: the mock above is intentionally permissive; the real `useReadContracts` returns `{ data: [{result, status}], ... }` for each contract call in the batch. The test verifies the hook composes the result shape, not the exact data values.

- [ ] **Step 4.2: Implement useVaultState**

Create `web/src/lib/hooks/useVaultState.ts`:

```typescript
"use client";

import { useReadContracts, useReadContract } from "wagmi";
import { CONTRACTS, vaultAbi, erc20Abi } from "../contracts";
import type { Address } from "viem";

export interface VaultStateLive {
  asset: Address;
  agent: Address;
  agentId: bigint;
  owner: Address;
  killSwitch: boolean;
  /** Vault's holding of the risk asset, raw on-chain units. */
  assetBalance: bigint;
  /** Truncated address suitable for display, e.g. "0x0651…469c". */
  address: string;
  /** Loading state across the batch. */
  isLoading: boolean;
  isError: boolean;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function useVaultState(): VaultStateLive {
  const batch = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "asset" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agent" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "agentId" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "owner" },
      { address: CONTRACTS.vault, abi: vaultAbi, functionName: "killSwitch" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const balance = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CONTRACTS.vault],
    query: { refetchInterval: 12_000 },
  });

  const r = batch.data;
  return {
    asset: (r?.[0]?.result as Address | undefined) ?? CONTRACTS.asset,
    agent: (r?.[1]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    agentId: (r?.[2]?.result as bigint | undefined) ?? CONTRACTS.agentId,
    owner: (r?.[3]?.result as Address | undefined) ?? "0x0000000000000000000000000000000000000000",
    killSwitch: Boolean(r?.[4]?.result ?? false),
    assetBalance: (balance.data as bigint | undefined) ?? 0n,
    address: shortAddr(CONTRACTS.vault),
    isLoading: batch.isLoading || balance.isLoading,
    isError: batch.isError || balance.isError,
  };
}
```

- [ ] **Step 4.3: Run test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/useVaultState.test.ts
```

Expected: 1/1 pass.

- [ ] **Step 4.4: Write usePolicy test (TDD)**

Create `web/test/lib/hooks/usePolicy.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useReadContract: vi.fn().mockReturnValue({
    data: [50, 500, 0n, 300, "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", "0x783bC82FE4AFB635De351EEB0D09542D3B09C847", 5000, 30],
    isLoading: false,
    isError: false,
  }),
}));

import { usePolicy } from "../../../src/lib/hooks/usePolicy";

describe("usePolicy", () => {
  it("decomposes vault.policy() tuple into a typed PolicyLive shape", () => {
    const { result } = renderHook(() => usePolicy());
    expect(result.current.earlyDivergenceBps).toBe(50);
    expect(result.current.terminalDivergenceBps).toBe(500);
    expect(result.current.maxSlippageBps).toBe(300);
    expect(result.current.maxBridgeLTVBps).toBe(5000);
  });
});
```

- [ ] **Step 4.5: Implement usePolicy**

Create `web/src/lib/hooks/usePolicy.ts`:

```typescript
"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, vaultAbi } from "../contracts";
import type { Address } from "viem";

export interface PolicyLive {
  earlyDivergenceBps: number;
  terminalDivergenceBps: number;
  liquidityFloor: bigint;
  maxSlippageBps: number;
  safeAsset: Address;
  bridgeVenue: Address;
  maxBridgeLTVBps: number;
  allowedActions: number;
  isLoading: boolean;
  isError: boolean;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";

export function usePolicy(): PolicyLive {
  const { data, isLoading, isError } = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "policy",
    query: { refetchInterval: 12_000 },
  });

  // Solidity returns a struct as a positional tuple via the ABI's `outputs`
  // array. The 8-field shape mirrors `Policy` struct in contracts/src/Policy.sol.
  const t = (data ?? []) as readonly unknown[];
  return {
    earlyDivergenceBps: (t[0] as number | undefined) ?? 0,
    terminalDivergenceBps: (t[1] as number | undefined) ?? 0,
    liquidityFloor: (t[2] as bigint | undefined) ?? 0n,
    maxSlippageBps: (t[3] as number | undefined) ?? 0,
    safeAsset: (t[4] as Address | undefined) ?? ZERO,
    bridgeVenue: (t[5] as Address | undefined) ?? ZERO,
    maxBridgeLTVBps: (t[6] as number | undefined) ?? 0,
    allowedActions: (t[7] as number | undefined) ?? 0,
    isLoading,
    isError,
  };
}
```

- [ ] **Step 4.6: Run test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/usePolicy.test.ts
```

Expected: 1/1 pass.

- [ ] **Step 4.7: Write useOraclePrice test (TDD)**

Create `web/test/lib/hooks/useOraclePrice.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useReadContract: vi.fn().mockReturnValue({
    data: 1_010_000_000_000_000_000n,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../../src/lib/contracts", () => ({
  CONTRACTS: {
    oracle: "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f",
    asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",  // USDT0, not USDY
    agentId: 106n,
  },
  rwaOracleAbi: [],
}));

import { useOraclePrice } from "../../../src/lib/hooks/useOraclePrice";

describe("useOraclePrice", () => {
  it("falls back to constant 1e18 when asset is not USDY", () => {
    const { result } = renderHook(() => useOraclePrice());
    expect(result.current.priceWei).toBe(1_000_000_000_000_000_000n);
    expect(result.current.source).toBe("constant");
  });
});
```

- [ ] **Step 4.8: Implement useOraclePrice**

Create `web/src/lib/hooks/useOraclePrice.ts`:

```typescript
"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, rwaOracleAbi } from "../contracts";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const ONE_E18 = 1_000_000_000_000_000_000n;

export interface OraclePriceLive {
  priceWei: bigint;
  /** "oracle" when reading RWADynamicOracle, "constant" when asset is permissionless. */
  source: "oracle" | "constant";
  isLoading: boolean;
  isError: boolean;
}

export function useOraclePrice(): OraclePriceLive {
  const isUsdy = CONTRACTS.asset.toLowerCase() === USDY.toLowerCase();

  const oracle = useReadContract({
    address: CONTRACTS.oracle,
    abi: rwaOracleAbi,
    functionName: "getPrice",
    query: { enabled: isUsdy, refetchInterval: 12_000 },
  });

  if (!isUsdy) {
    return { priceWei: ONE_E18, source: "constant", isLoading: false, isError: false };
  }
  return {
    priceWei: (oracle.data as bigint | undefined) ?? ONE_E18,
    source: "oracle",
    isLoading: oracle.isLoading,
    isError: oracle.isError,
  };
}
```

- [ ] **Step 4.9: Run test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/useOraclePrice.test.ts
```

Expected: 1/1 pass.

- [ ] **Step 4.10: Write useDexPrice test (TDD)**

Create `web/test/lib/hooks/useDexPrice.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useSim = vi.fn();
vi.mock("wagmi", () => ({ useSimulateContract: useSim }));

import { useDexPrice } from "../../../src/lib/hooks/useDexPrice";

describe("useDexPrice", () => {
  it("returns price normalised to 1e18 on quoter success", () => {
    useSim.mockReturnValueOnce({
      data: { result: [999_000n, 0n, 0, 0n] },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useDexPrice());
    expect(result.current.priceWei).toBe(999_000_000_000_000_000n);
    expect(result.current.fellBack).toBe(false);
  });

  it("falls back to 1e18 when the quoter reverts (zero liquidity)", () => {
    useSim.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("execution reverted"),
    });
    const { result } = renderHook(() => useDexPrice());
    expect(result.current.priceWei).toBe(1_000_000_000_000_000_000n);
    expect(result.current.fellBack).toBe(true);
  });
});
```

- [ ] **Step 4.11: Implement useDexPrice**

Create `web/src/lib/hooks/useDexPrice.ts`:

```typescript
"use client";

import { useSimulateContract } from "wagmi";
import { CONTRACTS, quoterV2Abi } from "../contracts";

const ONE_E18 = 1_000_000_000_000_000_000n;
const FEE_TIER = 100; // matches agent's main.ts (USDT0/USDC pool exists only at fee 100)
const PROBE_AMOUNT = 1_000_000n; // 1 USDT0 (6 dec); matches AgniPriceSource

export interface DexPriceLive {
  priceWei: bigint;
  fellBack: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useDexPrice(): DexPriceLive {
  const sim = useSimulateContract({
    address: CONTRACTS.quoter,
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [{
      tokenIn: CONTRACTS.asset,
      tokenOut: CONTRACTS.safeAsset,
      amountIn: PROBE_AMOUNT,
      fee: FEE_TIER,
      sqrtPriceLimitX96: 0n,
    }],
    query: { refetchInterval: 12_000 },
  });

  // Mantle live USDT0/USDC pool has zero liquidity → quoter reverts. Same
  // revert-tolerant fallback the agent uses (see agent/src/adapters/AgniPriceSource.ts).
  if (sim.isError || !sim.data) {
    return {
      priceWei: ONE_E18,
      fellBack: true,
      isLoading: sim.isLoading,
      isError: false,
    };
  }
  const [amountOut] = sim.data.result as readonly [bigint, bigint, number, bigint];
  // amountOut is 6-dec USDC; normalise to 1e18 by multiplying by 10^(18-6) = 1e12.
  return {
    priceWei: amountOut * 1_000_000_000_000n,
    fellBack: false,
    isLoading: sim.isLoading,
    isError: false,
  };
}
```

- [ ] **Step 4.12: Run test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/useDexPrice.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 4.13: Full suite check**

```bash
cd web && npx vitest run
```

Expected: 29 baseline + 5 from T2 (3 ipfs + 2 contracts) + 1 from T3 (providers) + 5 from T4 (1 vault + 1 policy + 1 oracle + 2 dex) = 40 pass.

- [ ] **Step 4.14: Commit read hooks**

```bash
git add web/src/lib/hooks/ web/test/lib/hooks/
git commit -m "feat(web): read hooks — useVaultState + usePolicy + useOraclePrice + useDexPrice"
```

---

## Task 5: Verify FeedbackGiven ABI + useDecisionLog

**Goal:** Pre-flight verification that our inlined FeedbackGiven ABI matches the live-log topic, then build `useDecisionLog` that subscribes via `useWatchContractEvent` filtered by `agentId` and resolves each entry's URI via the ipfs lib + React Query cache.

**Files:**
- Modify (if needed): `web/src/lib/contracts.ts` (event signature correction)
- Create: `web/src/lib/hooks/useDecisionLog.ts`
- Test: `web/test/lib/hooks/useDecisionLog.test.ts`

- [ ] **Step 5.1: Verify event signature against live-log topic**

Run from the repo root:

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
node -e "
const { keccak256, toBytes } = require('viem');
const candidates = [
  'FeedbackGiven(uint256,address,int128,uint8,string,string,string,string,bytes32)',
  'FeedbackGiven(uint256,address,bytes32,int128,uint8,string,string,string,string)',
  'FeedbackGiven(uint256,address,address,int128,uint8,string,string,string,string,bytes32)',
  'FeedbackGiven(uint256,address,int128,uint8,bytes32,string,string,string,string,bytes32)',
];
const target = '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc';
for (const c of candidates) {
  const h = keccak256(toBytes(c));
  console.log(h === target ? '✓ MATCH' : '  ', h, c);
}
"
```

Note: viem is at `agent/node_modules/viem` — run from `agent/` or use `node --experimental-vm-modules -e ...` if needed. Alternatively run inside the web workspace where viem is installed (Step 4 introduced it).

Inspect the output. If one candidate produces the matching hash, that's the canonical event signature — update `reputationRegistryAbi` in `web/src/lib/contracts.ts` accordingly. If no candidate matches:

1. Read the upstream ERC-8004 reference at https://github.com/erc-8004/erc-8004-contracts/blob/main/abis/ReputationRegistry.json (the same source Plan 5 Task 1 verified `giveFeedback` against).
2. Or decode the topic by inspecting `cast logs --address 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 --rpc-url https://rpc.mantle.xyz` data layouts and reverse-engineering. Tag1+tag2 should appear at offsets matching their lengths in the data section.

Save the correct signature to a comment in `contracts.ts` next to `reputationRegistryAbi`. Re-run the hash check to confirm. If still uncertain, STOP and ask the controller — without the right event ABI, the live decision log won't decode.

- [ ] **Step 5.2: Update contracts.ts ABI if Step 5.1 found a mismatch**

If the existing 9-input shape (in `web/src/lib/contracts.ts` from Task 2.3) didn't match, replace its `inputs` array with the correct order and indexed flags. Re-run:

```bash
cd web && npx vitest run test/lib/contracts.test.ts
```

Expected: still passes — the test asserts the event NAME exists, not the shape, so it stays green either way. Commit any ABI fix as a small follow-up to Task 2.

- [ ] **Step 5.3: Write useDecisionLog test (TDD)**

Create `web/test/lib/hooks/useDecisionLog.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useWatchContractEvent: vi.fn(),  // we just need it not to throw on render
  useBlockNumber: vi.fn().mockReturnValue({ data: 96000000n }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

import { useDecisionLog } from "../../../src/lib/hooks/useDecisionLog";

describe("useDecisionLog", () => {
  it("returns the empty-log state initially", () => {
    const { result } = renderHook(() => useDecisionLog());
    expect(result.current.entries).toEqual([]);
    expect(result.current.attestationsTotal).toBe(0);
  });

  // Note: the live subscription path is exercised by the rendered DecisionLog
  // component test (Task 7) where we feed mock entries directly. Testing
  // useWatchContractEvent's subscription mechanics directly would require a
  // viem mock harness larger than the hook itself — skipped per YAGNI.
});
```

- [ ] **Step 5.4: Implement useDecisionLog**

Create `web/src/lib/hooks/useDecisionLog.ts`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useWatchContractEvent, useBlockNumber } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CONTRACTS, reputationRegistryAbi } from "../contracts";
import { fetchAttestationJson, resolveUri } from "../ipfs";
import type { Log } from "viem";

export interface DecisionEntry {
  blockNumber: bigint;
  txHash: string;
  /** ipfs:// or data: URI from the event. */
  uri: string;
  /** Decoded payload, if fetch succeeded. */
  payload: {
    tick?: number;
    regime?: string;
    decision?: { action?: string; reasonCode?: string };
    signals?: Record<string, string>;
  } | undefined;
  /** Loading state for the payload fetch. */
  payloadLoading: boolean;
}

export interface DecisionLogLive {
  entries: DecisionEntry[];
  attestationsTotal: number;
  isLoading: boolean;
}

/** Holds the rolling buffer of recent events. The hook reads up to the last 5
 *  entries for display and the running total for the counter. */
const MAX_BUFFERED = 50;

export function useDecisionLog(): DecisionLogLive {
  const [events, setEvents] = useState<Array<{ blockNumber: bigint; txHash: string; uri: string }>>([]);

  useWatchContractEvent({
    address: CONTRACTS.reputationRegistry,
    abi: reputationRegistryAbi,
    eventName: "FeedbackGiven",
    args: { agentId: CONTRACTS.agentId },
    onLogs(logs: Log[]) {
      const decoded = logs.map((l: any) => ({
        blockNumber: l.blockNumber as bigint,
        txHash: l.transactionHash as string,
        uri: (l.args?.feedbackURI as string) ?? "",
      }));
      setEvents((prev) => {
        const merged = [...prev, ...decoded];
        // Dedup by txHash + keep last MAX_BUFFERED, newest last.
        const seen = new Set<string>();
        const out: typeof merged = [];
        for (const e of merged.reverse()) {
          if (seen.has(e.txHash)) continue;
          seen.add(e.txHash);
          out.push(e);
        }
        return out.reverse().slice(-MAX_BUFFERED);
      });
    },
    poll: true,
    pollingInterval: 12_000,
  });

  const lastFive = events.slice(-5).reverse();

  // Resolve payload JSON per URI. React Query caches by URI for 60 s — repeat
  // resolutions during refetch don't refire the network call.
  const enriched: DecisionEntry[] = lastFive.map((e) => {
    const q = useQuery({
      queryKey: ["attestation-payload", e.uri],
      queryFn: () => fetchAttestationJson(e.uri),
      enabled: !!e.uri,
      staleTime: 60_000,
    });
    return {
      blockNumber: e.blockNumber,
      txHash: e.txHash,
      uri: e.uri,
      payload: q.data as DecisionEntry["payload"],
      payloadLoading: q.isLoading,
    };
  });

  return {
    entries: enriched,
    attestationsTotal: events.length,
    isLoading: false,
  };
}
```

**WARNING:** the `events.slice(-5).map(useQuery)` pattern violates React's rules of hooks when `events.length` changes between renders. A safer pattern is to do all five `useQuery` calls unconditionally (with `enabled: !!uri` gating execution) and pad the events list to a fixed length. Refactor `enriched` as:

```typescript
const slots = [0, 1, 2, 3, 4].map((i) => lastFive[i]); // padded with undefined
const enriched: DecisionEntry[] = slots.map((e, _i) => {
  const uri = e?.uri ?? "";
  const q = useQuery({
    queryKey: ["attestation-payload", uri],
    queryFn: () => fetchAttestationJson(uri),
    enabled: uri.length > 0,
    staleTime: 60_000,
  });
  if (!e) return { blockNumber: 0n, txHash: "", uri: "", payload: undefined, payloadLoading: false };
  return {
    blockNumber: e.blockNumber,
    txHash: e.txHash,
    uri: e.uri,
    payload: q.data as DecisionEntry["payload"],
    payloadLoading: q.isLoading,
  };
}).filter((e) => e.txHash !== "");
```

This calls `useQuery` exactly 5 times on every render — order-stable, hook-rules-compliant.

- [ ] **Step 5.5: Run useDecisionLog test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/useDecisionLog.test.ts
```

Expected: 1/1 pass. If the `useQuery` mock complains because vitest doesn't see the import, ensure the mock path matches exactly (we mock `@tanstack/react-query`, which is what `useDecisionLog` imports).

- [ ] **Step 5.6: Commit useDecisionLog**

```bash
git add web/src/lib/contracts.ts web/src/lib/hooks/useDecisionLog.ts web/test/lib/hooks/useDecisionLog.test.ts
git commit -m "feat(web): useDecisionLog hook — ERC-8004 FeedbackGiven stream with IPFS-enriched entries"
```

---

## Task 6: useDeposit composed hook

**Goal:** A single hook that handles the two-step approve-then-deposit flow for ERC-20 deposits into the vault. Exposes a `deposit(amount)` action callable from `OnboardingFlow`, with `state` reflecting which step is in flight (`idle | approving | approve-confirmed | depositing | done | error`).

**Files:**
- Create: `web/src/lib/hooks/useDeposit.ts`
- Test: `web/test/lib/hooks/useDeposit.test.ts`

- [ ] **Step 6.1: Write useDeposit test (TDD)**

Create `web/test/lib/hooks/useDeposit.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useReadContract = vi.fn();
const useWriteContract = vi.fn();
const useAccount = vi.fn();

vi.mock("wagmi", () => ({ useReadContract, useWriteContract, useAccount }));

import { useDeposit } from "../../../src/lib/hooks/useDeposit";

describe("useDeposit", () => {
  it("starts in idle state when wallet is disconnected", () => {
    useAccount.mockReturnValueOnce({ address: undefined, isConnected: false });
    useReadContract.mockReturnValueOnce({ data: 0n, refetch: vi.fn() });
    useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useDeposit());
    expect(result.current.state).toBe("idle");
    expect(result.current.canDeposit).toBe(false);
  });

  it("canDeposit is true once wallet connected and allowance sufficient for amount", () => {
    useAccount.mockReturnValueOnce({ address: "0xUSER", isConnected: true });
    useReadContract.mockReturnValueOnce({ data: 1_000_000_000_000n, refetch: vi.fn() }); // ample allowance
    useWriteContract.mockReturnValueOnce({ writeContractAsync: vi.fn(), isPending: false });
    const { result } = renderHook(() => useDeposit());
    expect(result.current.canDeposit).toBe(true);
  });
});
```

- [ ] **Step 6.2: Implement useDeposit**

Create `web/src/lib/hooks/useDeposit.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { CONTRACTS, erc20Abi, vaultAbi } from "../contracts";

export type DepositState =
  | "idle"
  | "approving"
  | "approve-confirmed"
  | "depositing"
  | "done"
  | "error";

export interface DepositLive {
  state: DepositState;
  /** True when wallet is connected; deposit() can be invoked. */
  canDeposit: boolean;
  /** Latest approve tx hash (if any). */
  approveTxHash: string | undefined;
  /** Latest deposit tx hash (if any). */
  depositTxHash: string | undefined;
  error: string | undefined;
  /** Invoke the full approve-then-deposit flow with the given amount in
   *  asset-native units (e.g. 100_000_000n for 100 USDT0 at 6 dec). */
  deposit: (amount: bigint) => Promise<void>;
}

export function useDeposit(): DepositLive {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<DepositState>("idle");
  const [approveTxHash, setApproveTxHash] = useState<string>();
  const [depositTxHash, setDepositTxHash] = useState<string>();
  const [error, setError] = useState<string>();

  const allowanceRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.vault] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const deposit = useCallback(async (amount: bigint) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    try {
      const currentAllowance = (allowanceRead.data as bigint | undefined) ?? 0n;
      if (currentAllowance < amount) {
        setState("approving");
        const txApprove = await writeContractAsync({
          address: CONTRACTS.asset,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.vault, amount],
        });
        setApproveTxHash(txApprove);
        setState("approve-confirmed");
        await allowanceRead.refetch();
      }
      setState("depositing");
      const txDeposit = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount],
      });
      setDepositTxHash(txDeposit);
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, allowanceRead, writeContractAsync]);

  return {
    state,
    canDeposit: isConnected && !!address,
    approveTxHash,
    depositTxHash,
    error,
    deposit,
  };
}
```

- [ ] **Step 6.3: Run useDeposit test (expect pass)**

```bash
cd web && npx vitest run test/lib/hooks/useDeposit.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 6.4: Commit deposit hook**

```bash
git add web/src/lib/hooks/useDeposit.ts web/test/lib/hooks/useDeposit.test.ts
git commit -m "feat(web): useDeposit composed hook (allowance → approve → deposit, with MantleScan tx links)"
```

---

## Task 7: Wire components to live data — HeroStat / PolicyPanel / DecisionLog

**Goal:** Replace the mock props passed into HeroStat, PolicyPanel, and DecisionLog with live data from the Task 4–5 hooks. Keep the visual structure unchanged (Plan 4 design is locked).

**Files:**
- Modify: `web/src/components/HeroStat.tsx`
- Modify: `web/src/components/PolicyPanel.tsx`
- Modify: `web/src/components/DecisionLog.tsx`
- Modify: `web/test/HeroStat.test.tsx`, `DecisionLog.test.tsx`

**Strategy:** Define a small adapter inside `app/page.tsx` (Task 9) that combines hook outputs into the existing `VaultState` / `PolicyView` / `LogEntry` shapes; components themselves stay prop-driven. This task only updates two presentational tweaks where the live data needs different formatting (e.g., `assetBalance` is bigint in 6-dec USDT0 units; existing component takes `usdyBalance: number`).

- [ ] **Step 7.1: Add a number-from-bigint helper to HeroStat for asset balance display**

Edit `web/src/components/HeroStat.tsx`. Replace the line that prints `vault.usdyBalance.toFixed(2)` with a helper that handles bigint → display:

```typescript
function fmtAssetBalance(rawUnits: number, symbol: string): string {
  // rawUnits is already display-units (caller scales from raw bigint).
  return `${rawUnits.toFixed(2)} ${symbol}`;
}
```

Then in the JSX, change:

```
{vault.usdyBalance.toFixed(2)} USDY
```

to:

```
{fmtAssetBalance(vault.usdyBalance, vault.asset)}
```

This keeps the prop shape unchanged but lets the new live adapter pass either "USDT0" or "USDY" as the symbol.

- [ ] **Step 7.2: Run HeroStat test (verify still passes)**

```bash
cd web && npx vitest run test/HeroStat.test.tsx
```

Expected: existing tests pass (asset-string change is backward-compatible because `mockVault.asset === "USDY"` already).

- [ ] **Step 7.3: Update DecisionLog to accept optional tx-explorer-link rendering**

Edit `web/src/components/DecisionLog.tsx`. Augment the `LogEntry` rendering so the `txShort` becomes a hyperlink when `entry.txHash` (a new optional field) is present. Backward-compatible: when `txHash` is undefined, just show the existing `txShort` text.

In the rendering block, find the place that shows `entry.txShort` and replace with:

```typescript
{entry.txHash ? (
  <a
    href={`${process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz"}/tx/${entry.txHash}`}
    target="_blank"
    rel="noreferrer"
    style={{ color: "var(--ink-cyan)", textDecoration: "none" }}
    title={entry.txHash}
  >
    {entry.txShort}
  </a>
) : (
  <span>{entry.txShort}</span>
)}
```

Add `txHash?: string` to the `LogEntry` interface in `mockData.ts` (keep the interface backward-compatible by making it optional).

- [ ] **Step 7.4: Update DecisionLog test for the link path**

Edit `web/test/DecisionLog.test.tsx`. Add a test:

```typescript
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DecisionLog from "../src/components/DecisionLog";
import type { LogEntry } from "../src/lib/mockData";

describe("DecisionLog with txHash", () => {
  it("renders txShort as an external MantleScan link when txHash is provided", () => {
    const entries: LogEntry[] = [{
      timestamp: "14:02",
      reasonCode: "park-calm",
      description: "yield deployed",
      txShort: "0x84…f2",
      txHash: "0x84abc",
    }];
    const { container } = render(
      <DecisionLog entries={entries} attestationsAttested={1} attestationsTotal={1} />,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toContain("/tx/0x84abc");
  });
});
```

- [ ] **Step 7.5: Run updated DecisionLog test**

```bash
cd web && npx vitest run test/DecisionLog.test.tsx
```

Expected: existing tests pass + the new link-rendering test passes (4 total in that file).

- [ ] **Step 7.6: Commit component updates**

```bash
git add web/src/components/HeroStat.tsx web/src/components/DecisionLog.tsx web/src/lib/mockData.ts web/test/HeroStat.test.tsx web/test/DecisionLog.test.tsx
git commit -m "feat(web): wire HeroStat + DecisionLog for live data (asset symbol pass-through, optional tx-link)"
```

---

## Task 8: Real OnboardingFlow with ConnectKit + deposit flow

**Goal:** Replace OnboardingFlow's mock "click connect" button with the real `<ConnectKitButton />`, and replace its mock onDeposit with a call into `useDeposit`. Preserve the visual design.

**Files:**
- Modify: `web/src/components/OnboardingFlow.tsx`
- Test: `web/test/OnboardingFlow.test.tsx`

- [ ] **Step 8.1: Write OnboardingFlow test (TDD)**

Create `web/test/OnboardingFlow.test.tsx`:

```typescript
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("connectkit", () => ({
  ConnectKitButton: ({ children }: { children?: any }) =>
    (typeof children === "function" ? children({ isConnected: false, show: () => {}, address: undefined, ensName: undefined }) : <button>[ connect wallet ]</button>),
}));

vi.mock("wagmi", () => ({
  useAccount: vi.fn().mockReturnValue({ address: undefined, isConnected: false }),
  useReadContract: vi.fn().mockReturnValue({ data: 0n, refetch: vi.fn() }),
  useWriteContract: vi.fn().mockReturnValue({ writeContractAsync: vi.fn(), isPending: false }),
}));

import OnboardingFlow from "../src/components/OnboardingFlow";

describe("OnboardingFlow", () => {
  it("renders the connect button in disconnected state", () => {
    const { getByText } = render(<OnboardingFlow onDeposit={() => {}} />);
    expect(getByText(/connect wallet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 8.2: Implement OnboardingFlow rewrite**

Replace `web/src/components/OnboardingFlow.tsx` with a version that:
- Uses `ConnectKitButton.Custom` (render-prop) for full visual control matching Schematic Blueprint
- Uses `useAccount()` to drive `stage` ("disconnected" | "connected")
- Calls `useDeposit().deposit(amount)` instead of the mock prop
- Surfaces pending tx hashes as MantleScan links during approve + deposit

```typescript
"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";
import Panel from "./Panel";
import PresetPicker from "./PresetPicker";
import type { PolicyPreset } from "../lib/mockData";
import { useDeposit } from "../lib/hooks/useDeposit";

interface OnboardingFlowProps {
  onDeposit: (preset: PolicyPreset["id"], amountUsd: number) => void;
}

function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected, address, ensName }) => (
        <button
          type="button"
          onClick={show}
          style={{
            cursor: "pointer",
            background: "transparent",
            border: "1px solid var(--ink-cyan)",
            color: "var(--ink-cyan)",
            padding: "10px 22px",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          {isConnected
            ? `[ ${ensName ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`} ]`
            : "[ connect wallet ]"}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

export default function OnboardingFlow({ onDeposit }: OnboardingFlowProps) {
  const { isConnected } = useAccount();
  const [preset, setPreset] = useState<PolicyPreset["id"]>("balanced");
  const [amount, setAmount] = useState<string>("100");
  const dep = useDeposit();
  const explorer = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

  if (!isConnected) {
    return (
      <Panel title={`// session`} meta="[ AUTH ]">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18, padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: 22, color: "var(--text-strong)", fontWeight: 300, marginBottom: 6, letterSpacing: "-0.01em" }}>
              Connect a wallet to begin.
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Solvent never custodies your asset. Vault is on-chain; agent reads price/NAV and writes ERC-8004 attestations.
            </div>
          </div>
          <ConnectButton />
        </div>
      </Panel>
    );
  }

  const amountRaw = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 1_000_000)); // USDT0 has 6 decimals
  })();

  const onClickDeposit = async () => {
    if (amountRaw === 0n) return;
    await dep.deposit(amountRaw);
    if (dep.state === "done") {
      onDeposit(preset, Number(amount));
    }
  };

  const busy = dep.state === "approving" || dep.state === "depositing";

  return (
    <Panel title={`// session`} meta="[ READY ]">
      <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "10px 0" }}>
        <ConnectButton />

        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            {"// amount (USDT0)"}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            style={{
              background: "rgba(124,213,255,.04)",
              border: "1px solid rgba(124,213,255,.25)",
              color: "var(--text-strong)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 14,
              width: 180,
            }}
          />
        </div>

        <PresetPicker selected={preset} onSelect={setPreset} />

        <button
          type="button"
          onClick={onClickDeposit}
          disabled={busy || amountRaw === 0n}
          style={{
            cursor: busy ? "wait" : "pointer",
            background: busy ? "transparent" : "var(--ink-cyan)",
            border: "1px solid var(--ink-cyan)",
            color: busy ? "var(--ink-cyan)" : "var(--bg-deep)",
            padding: "10px 22px",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderRadius: 2,
            opacity: amountRaw === 0n ? 0.4 : 1,
          }}
        >
          {dep.state === "approving" ? "[ approving… ]"
           : dep.state === "depositing" ? "[ depositing… ]"
           : dep.state === "done" ? "[ deposited ✓ ]"
           : "[ deposit ]"}
        </button>

        {dep.approveTxHash && (
          <a href={`${explorer}/tx/${dep.approveTxHash}`} target="_blank" rel="noreferrer"
             className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
            approve tx → {dep.approveTxHash.slice(0, 10)}…
          </a>
        )}
        {dep.depositTxHash && (
          <a href={`${explorer}/tx/${dep.depositTxHash}`} target="_blank" rel="noreferrer"
             className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
            deposit tx → {dep.depositTxHash.slice(0, 10)}…
          </a>
        )}
        {dep.error && (
          <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
            error: {dep.error}
          </div>
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 8.3: Run OnboardingFlow test (expect pass)**

```bash
cd web && npx vitest run test/OnboardingFlow.test.tsx
```

Expected: 1/1 pass.

- [ ] **Step 8.4: Commit OnboardingFlow rewrite**

```bash
git add web/src/components/OnboardingFlow.tsx web/test/OnboardingFlow.test.tsx
git commit -m "feat(web): real OnboardingFlow — ConnectKit button + useDeposit (approve→deposit with MantleScan links)"
```

---

## Task 9: ForkReplay component + JSON snapshot copy

**Goal:** Replace `BenchmarkReplay` with a `ForkReplay` component that loads one of two committed JSON snapshots, lets the user pick scenario, scrub through ticks, and toggle play/pause. Tick state panel shows regime/action/value with a MantleScan-style tx link (placeholder when the txHash is a synthetic from forkReplay).

**Files:**
- Create: `web/src/components/ForkReplay.tsx`
- Copy: `agent/replay-transient.json` → `web/public/replay-transient.json`
- Copy: `agent/replay-terminal.json` → `web/public/replay-terminal.json`
- Test: `web/test/ForkReplay.test.tsx`
- Delete: `web/src/components/BenchmarkReplay.tsx`

- [ ] **Step 9.1: Copy replay snapshots into web/public/**

```bash
cd C:/Users/egori/Desktop/projects/mantle-turing-test
cp agent/replay-transient.json web/public/replay-transient.json
cp agent/replay-terminal.json web/public/replay-terminal.json
ls -la web/public/replay-*.json
```

Expected: two files in `web/public/` each ~8 KB.

- [ ] **Step 9.2: Write ForkReplay test (TDD)**

Create `web/test/ForkReplay.test.tsx`:

```typescript
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ForkReplay from "../src/components/ForkReplay";

const FIXTURE_TRANSIENT = {
  scenario: "transient-depeg",
  ticks: [
    { tick: 0, regime: "CALM", action: "PARK_YIELD", reasonCode: "park-calm",
      signals: { navPrice: "1000000000000000000", marketPrice: "1000000000000000000",
        liquidityDepth: "0", assetBalance: "1000000000" },
      postActionBalance: "1000000000",
      txHash: "0xe04" + "0".repeat(60), uri: "data:..." },
    { tick: 1, regime: "EARLY_DEPEG", action: "SWAP_TO_SAFE", reasonCode: "early-exit",
      signals: { navPrice: "1000000000000000000", marketPrice: "960000000000000000",
        liquidityDepth: "1000000000000", assetBalance: "1000000000" },
      postActionBalance: "0",
      txHash: "0xe01" + "0".repeat(60), uri: "data:..." },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => FIXTURE_TRANSIENT,
  } as any);
});

describe("ForkReplay", () => {
  it("renders the scenario picker", async () => {
    const { getByLabelText } = render(<ForkReplay />);
    expect(getByLabelText(/transient/i)).toBeTruthy();
    expect(getByLabelText(/terminal/i)).toBeTruthy();
  });

  it("loads the selected scenario and displays the first tick", async () => {
    const { findByText } = render(<ForkReplay />);
    await findByText(/CALM/);
    await findByText(/park-calm/);
  });
});
```

- [ ] **Step 9.3: Implement ForkReplay**

Create `web/src/components/ForkReplay.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import Panel from "./Panel";

const REASON_COLOUR: Record<string, string> = {
  "park-calm": "var(--text-muted)",
  "calm-idle": "var(--text-muted)",
  "watch": "var(--warm-gold)",
  "early-exit": "var(--ink-cyan)",
  "terminal-exit": "var(--ink-cyan-bright)",
  "liquidity-bridge": "var(--ink-cyan)",
  "protect-failed-illiquid": "var(--warm-gold)",
};

interface Tick {
  tick: number;
  timestamp: number;
  regime: string;
  action: string;
  reasonCode: string;
  signals: {
    navPrice: string;
    marketPrice: string;
    liquidityDepth: string;
    assetBalance: string;
  };
  postActionBalance: string;
  txHash: string;
  uri: string;
}

interface ReplayDoc {
  scenario: string;
  ticks: Tick[];
}

type ScenarioId = "transient" | "terminal";
const SCENARIO_URL: Record<ScenarioId, string> = {
  transient: "/replay-transient.json",
  terminal: "/replay-terminal.json",
};

const PLAYBACK_INTERVAL_MS = 1500;

export default function ForkReplay() {
  const [scenario, setScenario] = useState<ScenarioId>("transient");
  const [doc, setDoc] = useState<ReplayDoc | null>(null);
  const [tickIndex, setTickIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const explorer = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

  // Load on scenario change.
  useEffect(() => {
    let cancelled = false;
    fetch(SCENARIO_URL[scenario])
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setDoc(d as ReplayDoc); setTickIndex(0); } })
      .catch((e) => console.error("ForkReplay fetch failed:", e));
    return () => { cancelled = true; };
  }, [scenario]);

  // Playback auto-advance.
  useEffect(() => {
    if (!playing || !doc) return;
    const id = setInterval(() => {
      setTickIndex((i) => {
        const next = i + 1;
        if (next >= doc.ticks.length) {
          setPlaying(false);
          return doc.ticks.length - 1;
        }
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, doc]);

  if (!doc) {
    return (
      <Panel title={`// fork_replay`} meta="[ LOADING ]">
        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
          loading scenario&hellip;
        </div>
      </Panel>
    );
  }

  const current = doc.ticks[tickIndex];
  const reasonColour = REASON_COLOUR[current.reasonCode] ?? "var(--ink-cyan-bright)";
  const usd = (raw: string) => (Number(BigInt(raw)) / 1_000_000).toFixed(2);

  return (
    <Panel title={`// fork_replay · ${doc.scenario}`} meta={`[ TICK ${tickIndex + 1}/${doc.ticks.length} ]`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* scenario picker */}
        <div style={{ display: "flex", gap: 12 }} className="mono">
          {(["transient", "terminal"] as ScenarioId[]).map((id) => (
            <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
              <input
                type="radio"
                name="scenario"
                value={id}
                checked={scenario === id}
                onChange={() => setScenario(id)}
                aria-label={id === "transient" ? "transient-depeg" : "terminal-collapse"}
              />
              {id === "transient" ? "transient-depeg" : "terminal-collapse"}
            </label>
          ))}
        </div>

        {/* scrubber + play/pause */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--ink-cyan)",
              color: "var(--ink-cyan)",
              padding: "4px 12px",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              borderRadius: 2,
            }}
          >
            {playing ? "[ pause ]" : "[ play ]"}
          </button>
          <input
            type="range"
            min={0}
            max={doc.ticks.length - 1}
            value={tickIndex}
            onChange={(e) => setTickIndex(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--ink-cyan)" }}
            aria-label="tick scrubber"
          />
        </div>

        {/* current tick state */}
        <div className="mono" style={{ fontSize: 12, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", paddingTop: 8, borderTop: "1px solid rgba(124,213,255,.08)" }}>
          <span style={{ color: "var(--text-muted)" }}>regime</span>
          <span style={{ color: "var(--text-strong)" }}>{current.regime}</span>
          <span style={{ color: "var(--text-muted)" }}>action</span>
          <span style={{ color: reasonColour }}>{current.action} · {current.reasonCode}</span>
          <span style={{ color: "var(--text-muted)" }}>mkt price</span>
          <span style={{ color: "var(--text-strong)" }}>${(Number(BigInt(current.signals.marketPrice)) / 1e18).toFixed(4)}</span>
          <span style={{ color: "var(--text-muted)" }}>balance (USDT0)</span>
          <span style={{ color: "var(--text-strong)" }}>{usd(current.signals.assetBalance)} → {usd(current.postActionBalance)}</span>
          <span style={{ color: "var(--text-muted)" }}>tx</span>
          <a href={`${explorer}/tx/${current.txHash}`} target="_blank" rel="noreferrer"
             style={{ color: "var(--ink-cyan)", textDecoration: "none" }}>
            {current.txHash.slice(0, 10)}…
          </a>
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 9.4: Run ForkReplay test (expect pass)**

```bash
cd web && npx vitest run test/ForkReplay.test.tsx
```

Expected: 2/2 pass.

- [ ] **Step 9.5: Delete BenchmarkReplay**

```bash
git rm web/src/components/BenchmarkReplay.tsx
```

If `app/page.tsx` or any other file imports `BenchmarkReplay`, that import has to be replaced with `ForkReplay` — but the swap happens in Task 10 below, so for now `git rm` is sufficient (build will be broken until Task 10).

- [ ] **Step 9.6: Commit ForkReplay**

```bash
git add web/src/components/ForkReplay.tsx web/test/ForkReplay.test.tsx web/public/replay-transient.json web/public/replay-terminal.json
git commit -m "feat(web): ForkReplay component + JSON snapshot copies (replaces BenchmarkReplay)"
```

---

## Task 10: Page wiring + Vercel config + README + demo script

**Goal:** Final glue. Rewrite `app/page.tsx` to use the live hooks; create `vercel.json`; write the README + demo-script; user provides Vercel deploy. This is the largest task; broken into 11 fine-grained steps.

**Files:**
- Modify: `web/src/app/app/page.tsx`
- Create: `web/vercel.json`
- Create / rewrite: `README.md` (repo root)
- Create: `docs/demo-script.md`

**User-action gates:** Step 10.5 (Vercel project creation), Step 10.7–10.9 (screenshots).

- [ ] **Step 10.1: Rewrite app/page.tsx with live hooks**

The page becomes responsible for combining hook outputs into the existing `VaultState` / `PolicyView` / `LogEntry` shapes the child components expect. Build a small adapter `liveVaultState()` inline.

Replace `web/src/app/app/page.tsx` with:

```typescript
"use client";

import { useState, useMemo } from "react";
import BrandMark from "@/components/BrandMark";
import DashboardFrame from "@/components/DashboardFrame";
import HeroStat from "@/components/HeroStat";
import ChartPanel from "@/components/ChartPanel";
import PolicyPanel from "@/components/PolicyPanel";
import DecisionLog from "@/components/DecisionLog";
import Footer from "@/components/Footer";
import OnboardingFlow from "@/components/OnboardingFlow";
import ForkReplay from "@/components/ForkReplay";
import { PRESETS, type PolicyPreset, type VaultState, type PolicyView, type LogEntry } from "@/lib/mockData";
import { useVaultState } from "@/lib/hooks/useVaultState";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { useOraclePrice } from "@/lib/hooks/useOraclePrice";
import { useDexPrice } from "@/lib/hooks/useDexPrice";
import { useDecisionLog } from "@/lib/hooks/useDecisionLog";

const ASSET_DECIMALS = 6;          // USDT0
const ASSET_SYMBOL = "USDT0";
const SAFE_SYMBOL = "USDC";

function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

export default function DashboardPage() {
  const [activePreset, setActivePreset] = useState<PolicyPreset["id"]>("balanced");
  const [deposited, setDeposited] = useState(false);

  const vault = useVaultState();
  const policy = usePolicy();
  const oracle = useOraclePrice();
  const dex = useDexPrice();
  const log = useDecisionLog();

  const assetBalanceDisplay = Number(vault.assetBalance) / 10 ** ASSET_DECIMALS;
  const navUsd = Number(oracle.priceWei) / 1e18;
  const mktUsd = Number(dex.priceWei) / 1e18;
  const divergenceBps = navUsd > 0 ? Math.max(0, Math.round(((navUsd - mktUsd) / navUsd) * 10000)) : 0;

  const regime: VaultState["regime"] =
    divergenceBps >= (policy.terminalDivergenceBps || 500) ? "TERMINAL"
      : divergenceBps >= (policy.earlyDivergenceBps || 50) ? "EARLY"
      : "CALM";

  const vaultView: VaultState = useMemo(() => ({
    protectedPositionUsd: Math.round(assetBalanceDisplay),
    usdyBalance: +assetBalanceDisplay.toFixed(2),
    entryUsd: Math.round(assetBalanceDisplay) || 1, // entry baseline; updated on deposit
    deltaPct: 0,
    marketPrice: +mktUsd.toFixed(4),
    navPrice: +navUsd.toFixed(4),
    spreadBps: -divergenceBps,
    regime,
    divergenceBps,
    tickLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    attestationsAttested: log.attestationsTotal,
    attestationsTotal: log.attestationsTotal,
    address: vault.address,
    asset: ASSET_SYMBOL,
    network: "MANTLE",
    agentRevision: "v2.5.0",
    drawingId: "DWG-002",
  }), [assetBalanceDisplay, mktUsd, navUsd, divergenceBps, regime, vault.address, log.attestationsTotal]);

  const policyView: PolicyView = useMemo(() => ({
    earlyTrigBps: policy.earlyDivergenceBps,
    termTrigBps: policy.terminalDivergenceBps,
    maxLtvPct: Math.round(policy.maxBridgeLTVBps / 100),
    safeAsset: SAFE_SYMBOL,
    slippageCapBps: policy.maxSlippageBps,
  }), [policy.earlyDivergenceBps, policy.terminalDivergenceBps, policy.maxBridgeLTVBps, policy.maxSlippageBps]);

  const logEntries: LogEntry[] = log.entries.map((e) => ({
    timestamp: new Date(Number(e.blockNumber)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    reasonCode: (e.payload?.decision?.reasonCode as LogEntry["reasonCode"]) ?? "park-calm",
    description: e.payload?.decision?.action ?? (e.payloadLoading ? "resolving…" : "(no payload)"),
    txShort: shortHash(e.txHash),
    txHash: e.txHash,
  }));

  const handleDeposit = (_preset: PolicyPreset["id"], _amount: number) => {
    setDeposited(true);
  };

  const showOnboarding = !deposited && vault.assetBalance === 0n;

  return (
    <DashboardFrame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={32} />
          <div>
            <div style={{ fontSize: 17, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.75, marginTop: 2 }}>
              DEPEG.GUARDIAN  ·  {vaultView.agentRevision}
            </div>
          </div>
        </div>
      </div>

      {showOnboarding ? (
        <OnboardingFlow onDeposit={handleDeposit} />
      ) : (
        <>
          <HeroStat vault={vaultView} />
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 20 }}>
            <ChartPanel vault={vaultView} />
            <PolicyPanel policy={policyView} preset={activePreset} onSelectPreset={setActivePreset} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 22 }}>
            <DecisionLog entries={logEntries} attestationsAttested={vaultView.attestationsAttested} attestationsTotal={vaultView.attestationsTotal} />
            <ForkReplay />
          </div>
        </>
      )}
      <Footer />
    </DashboardFrame>
  );
}
```

The exact JSX layout may need to match what Plan 4's `app/page.tsx` had — keep the bento-style grid and any existing class names. If `PolicyPanel`'s prop API or `ChartPanel`'s prop API differs from what's used here, look up the existing prop signatures in the components and pass-through accordingly.

- [ ] **Step 10.2: Smoke-test the build**

```bash
cd web && npm run build 2>&1 | tail -30
```

Expected: build completes. Some warnings about Tailwind 4 / wagmi types are acceptable; failures are not. If a hook complains about being called outside a Provider — verify `layout.tsx` wraps with `Providers` (Task 3).

- [ ] **Step 10.3: Run full vitest suite + tsc**

```bash
cd web && npx vitest run && npx tsc --noEmit
```

Expected: target ~58 tests pass (29 baseline + new from T2–T9 minus deleted BenchmarkReplay test if any). tsc clean.

- [ ] **Step 10.4: Create Vercel config**

Create `web/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "out",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

The `web/` subdirectory will be the project root in Vercel. Vercel auto-detects Next.js when this config and `next.config.ts` are both present.

- [ ] **Step 10.5: USER ACTION — Vercel project setup**

STOP. Surface to the user:

> **Action required:** Create the Vercel project.
>
> 1. Go to https://vercel.com/new
> 2. Click **Import Git Repository** → choose `RaYYeR220/solvent`
> 3. Configure project:
>    - **Project Name:** `solvent` (or whatever URL slug you want)
>    - **Framework Preset:** Next.js (auto-detected)
>    - **Root Directory:** **`web`** ← important
>    - **Build Command:** (leave default — `npm run build`)
>    - **Output Directory:** (leave default — `out` for static export)
>    - **Install Command:** (leave default)
> 4. Click **Environment Variables**, paste each line below as separate vars:
>
>    ```
>    NEXT_PUBLIC_MANTLE_RPC=https://rpc.mantle.xyz
>    NEXT_PUBLIC_VAULT_ADDRESS=0x06513470e16a7d6071A12708c38a6fa0ED66469c
>    NEXT_PUBLIC_ATTEST_ADDRESS=0x89D3F83B777b245A80baec60277B449B8E72B5D3
>    NEXT_PUBLIC_REP_REGISTRY=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
>    NEXT_PUBLIC_AGENT_ID=106
>    NEXT_PUBLIC_ASSET_ADDRESS=0x779Ded0c9e1022225f8E0630b35a9b54bE713736
>    NEXT_PUBLIC_SAFE_ASSET_ADDRESS=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
>    NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
>    NEXT_PUBLIC_MANTLESCAN_URL=https://mantlescan.xyz
>    NEXT_PUBLIC_WC_PROJECT_ID=<your WC project ID from Task 1.2>
>    ```
>
> 5. Click **Deploy**. Wait for the first build to complete (~2 minutes).
> 6. Share the deployment URL with the controller (e.g. `https://solvent.vercel.app`). The controller will reference it in the README.

After user confirms, proceed.

- [ ] **Step 10.6: Write the repo-root README**

Replace `README.md` at the repo root with:

```markdown
# Solvent — Autonomous Depeg Guardian on Mantle

Track 3 (AI × RWA) submission to the **Mantle Turing Test 2026** hackathon.

**Live:** [<paste Vercel URL from Step 10.5>](<paste Vercel URL>)
**Repo:** https://github.com/RaYYeR220/solvent

## What it does

Solvent is an autonomous on-chain agent that monitors a Real-World Asset
(USDY/USDT0) vault every five minutes, watching the spread between the
asset's NAV and DEX market price. When divergence crosses policy thresholds,
the agent executes a pre-approved protective action — exit to a safe asset
via DEX, or post collateral to lending and borrow safe asset (bridge) — and
writes a verifiable attestation to the ERC-8004 ReputationRegistry that
Mantle deployed in Feb 2026 as Internet-of-Agents infrastructure.

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
    ┌────────┐   │  ┌────────────┐    ┌─────────────────────┐  │
    │ wallet │──▶│  │ SolventVault│◀──│ AgniDexAdapter      │  │
    │  user  │   │  │  custody +  │    └─────────────────────┘  │
    └────────┘   │  │  policy     │    ┌─────────────────────┐  │
                 │  │  enforcement│◀──│ InitLendingAdapter   │  │
                 │  └─────┬───────┘    └─────────────────────┘  │
                 │        │                                     │
                 │        ▼                                     │
                 │  ┌──────────────┐   ┌────────────────────┐   │
                 │  │SolventAttest │──▶│ ERC-8004           │   │
                 │  │ . record()   │   │ ReputationRegistry │   │
                 │  └──────────────┘   └─────────┬──────────┘   │
                 │                              event           │
                 └──────────────────────────────│───────────────┘
                                                │
            ┌─────────────────┐  hourly         │
            │  GitHub Actions │ ─tick──┐        │
            │   cron */1h     │        │        │
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
| Dashboard | <paste Vercel URL> |
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
```

- [ ] **Step 10.7: USER ACTION — capture 4 dashboard screenshots**

After Vercel deploy is live, capture the following screenshots and place them in `web/public/screenshots/` (create the directory):

1. `01-landing.png` — landing page hero
2. `02-onboarding.png` — connect wallet + deposit flow (with ConnectKit modal visible)
3. `03-dashboard-live.png` — full bento dashboard with live data (after demo deposit)
4. `04-fork-replay-terminal.png` — ForkReplay panel mid-scrub on terminal-collapse scenario, showing the agent's `terminal-exit` action

Screenshot dimensions: ~1440×900 (Mac default) is fine. PNG, no compression artifacts.

- [ ] **Step 10.8: Commit screenshots**

```bash
mkdir -p web/public/screenshots
# user adds files
git add web/public/screenshots/
git commit -m "docs(web): dashboard screenshots for submission"
```

- [ ] **Step 10.9: Write the demo script**

Create `docs/demo-script.md`:

```markdown
# Solvent — 5-minute demo script

**Audience:** hackathon judges
**Total runtime:** 5 minutes
**Live URL:** <paste Vercel URL>
**Agent attestation stream:** https://mantlescan.xyz/address/0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c

## 0:00–0:30 — Intro (30s)

> Solvent is an autonomous depeg guardian for a real-world-asset vault on
> Mantle. It watches the spread between NAV and DEX price, and when divergence
> crosses policy bounds, it executes a pre-approved protective swap or bridge
> — every five minutes, with every decision attested on-chain via Mantle's
> ERC-8004 ReputationRegistry.

> Three pieces: a hot-key autonomous agent running every five minutes from
> GitHub Actions; a vault-and-attestation contract pair on Mantle; and a
> dashboard you can open right now.

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

> [Scrub to tick 1, click play]

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
```

- [ ] **Step 10.10: Commit page + Vercel config + README + demo script**

```bash
git add web/src/app/app/page.tsx web/vercel.json README.md docs/demo-script.md
git commit -m "feat(web): live page wiring + Vercel config; docs: README pitch + demo script"
```

- [ ] **Step 10.11: Final full-suite check**

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: all tests pass, tsc clean, build succeeds. Verify the deployed Vercel URL loads end-to-end:

1. Open the Vercel URL in a browser
2. Click "Connect Wallet" → ConnectKit modal opens, theme matches Schematic Blueprint
3. (Optional) Connect a test wallet with mainnet USDT0 → try a small deposit → confirm the dashboard re-renders with live vault state
4. Switch ForkReplay scenarios → confirm both load and scrub correctly
5. Inspect Decision Log panel → confirm at least one entry from the live agent stream (after the first hourly cron fires)

If anything is broken end-to-end, file as a follow-up in the project README's "known issues" section or fix inline with one more commit.

---

## Self-review notes (controller, post-write)

**Spec coverage** (against design spec §9):

| Requirement | Task |
|---|---|
| wagmi + ConnectKit wiring (`layout.tsx`, providers) | Task 3 |
| `lib/wagmi.ts` (mantle chain, connectors, theme) | Task 2 |
| `lib/contracts.ts` (addresses + ABIs) | Task 2 |
| `lib/ipfs.ts` (URI resolver) | Task 2 |
| Live read hooks (vault state, policy, oracle, dex) | Task 4 |
| `useDecisionLog` (ERC-8004 event stream + IPFS enrichment) | Task 5 |
| `useDeposit` composed hook | Task 6 |
| HeroStat / PolicyPanel / DecisionLog wired to live data | Task 7 |
| OnboardingFlow real ConnectKit + deposit | Task 8 |
| ForkReplay component + replay JSON copy | Task 9 |
| ChartPanel interactive hover overlay | DEFERRED (spec-noted stretch) — see "Stretch" below |
| Vercel hosting | Task 10 (Steps 10.4, 10.5) |
| Env vars (NEXT_PUBLIC_*) | Task 1 + Task 10.5 |
| README + demo-script + screenshots | Task 10 (Steps 10.6, 10.7, 10.9) |

**Stretch (deferred per spec):**
- ChartPanel interactive hover overlay — Plan 4 chart is currently static; building a real price-history time-series requires an indexer or subgraph. Skipped per spec §10 ("Subgraph indexer is out of scope"). The static chart remains visible; the demo narrative leans on ForkReplay for the dynamic visualisation.
- Custom Vercel domain — default `*.vercel.app` is acceptable for submission.
- Demo video recording — only if time permits per spec.

**Type consistency:** `VaultState` / `PolicyView` / `LogEntry` (from `mockData.ts`) remain the canonical prop shapes for HeroStat / PolicyPanel / DecisionLog. The live hooks (`VaultStateLive`, `PolicyLive`, `DecisionEntry`) return richer shapes that the page-level adapter (Task 10.1) narrows down. This pattern keeps the components prop-pure and lets us evolve the hooks without component rewrites.

**Known coupling:** Task 9 deletes `BenchmarkReplay.tsx` but the page swap to `ForkReplay` happens only in Task 10.1. Between Tasks 9 and 10 the build is intentionally broken — implementers should not stop and panic; just proceed.

**Placeholder check:** no "TBD" or "implement later" markers; every code step has a complete snippet; the user-action gates are explicit STOP markers with verbatim escalation copy.
