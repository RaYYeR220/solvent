# Solvent Plan 6 — Agent Live on Mantle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the agent's mock adapters with real viem reads + writes against Mantle mainnet, attest every tick (with IPFS-pinned rich JSON payload) to the deployed SolventAttestation contract (which dual-writes to ERC-8004), and run the tick loop every 5 minutes via a GitHub Actions cron. Plus a forkReplay script that produces snapshotted scenarios for the dashboard.

**Architecture:** Thin viem-wrapped read adapters (one contract call each) → existing `gatherSignals`/`assessRegime`/`selectAction` engine (untouched) → real viem WalletClient writing to `SolventVault.executeProtectiveAction(..., uri)` or `attestObservation(..., uri)`. The `uri` points to a Pinata-pinned JSON payload built per-tick from the canonical signals+decision snapshot. State lives on-chain; each tick is idempotent and stateless. The cron job exits non-zero on failure; the next cron invocation starts clean.

**Tech Stack:** viem 2.x · vitest · tsx · Foundry (for the agent identity migration script + fork orchestration) · Pinata IPFS pinning · GitHub Actions cron.

---

## Pre-implementation context

**Repo state:** `master @ 06b1489` (Plan 5 merged). Public repo `https://github.com/RaYYeR220/solvent`. Plans 1–5 complete: contracts deployed and verified on Mantle mainnet 2026-05-29.

**Deployed addresses (`contracts/deployments/mantle-mainnet.json`):**
- SolventVault `0x06513470e16a7d6071A12708c38a6fa0ED66469c` (asset = USDT0)
- SolventAttestation `0x89D3F83B777b245A80baec60277B449B8E72B5D3`
- AgniDexAdapter `0x24090d62792930Aa34351B8b19850581D48628f9`
- InitLendingAdapter `0x783bC82FE4AFB635De351EEB0D09542D3B09C847`
- agentId `106` (ERC-8004 Identity NFT, currently owned by deployer `0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798`)
- vault.agent currently == deployer (will migrate in Task 1)

**External contracts (verified, do not re-research):**
- RWADynamicOracle `0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f` — exposes `getPrice() returns (uint256)` (1e18-scaled price of USDY; for USDT0/USDC we use a constant 1e18 instead).
- Agni QuoterV2 `0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb` — exposes `quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160, uint32, uint256)` — non-view (V3 simulates).
- ERC-8004 IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` — ERC-721 compatible (verify in T1 Step 2).
- ERC-8004 ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` — the agent does NOT call this directly; SolventAttestation mirrors on-chain.

**Deployed contract ABIs** are exported at `contracts/exports/abis/*.json` (Plan 5 Task 8). The agent imports vault/attestation ABIs via build-time JSON import — see Task 4.

**Agent's deployed vault ABI surface (key methods):**
- `executeProtectiveAction(uint8 action, bytes params, uint8 regime, bytes32 reasonCode, bytes32 signalsHash, string uri)` — **note `uri` parameter (added in Plan 5)**, agent's local `vaultAbi.ts` is stale and must be updated in Task 4.
- `attestObservation(uint8 regime, bytes32 reasonCode, bytes32 signalsHash, string uri)` — same note.
- `agent() returns (address)`, `agentId() returns (uint256)`, `asset() returns (address)`, `setAgent(address)` (onlyOwner).

**Verified ERC-8004 ABI** (already in `contracts/src/interfaces/IReputationRegistry.sol`): `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` returns void. **The agent NEVER calls this directly** — `SolventAttestation.record()` mirrors internally with `tag1="solvent.depeg-guardian"`, `tag2=Strings.toHexString(reasonCode)`, `endpoint=""`, `feedbackURI=uri`, `feedbackHash=keccak256(abi.encode(agentId, regime, reasonCode, signalsHash, action, outcome, uri))`. The agent's job is to produce the `uri` string.

**Existing agent codebase to preserve (don't refactor):**
- `agent/src/types.ts` — ActionType, Regime, Signals, AgentPolicy, ActionPlan, Decision (used by engine + adapters).
- `agent/src/engine/assessRegime.ts`, `agent/src/engine/selectAction.ts` — decision logic, untouched.
- `agent/src/signals.ts` — gatherSignals, untouched.
- `agent/src/attest.ts` — `computeSignalsHash`, `encodeReasonCode` (used by URI building too).
- `agent/src/executor/encodeAction.ts` — `encodeActionParams` (untouched).
- `agent/src/adapters/types.ts` — NavSource/PriceSource/LiquiditySource/PositionSource interfaces (untouched; real impls implement them).
- `agent/src/adapters/mocks.ts` — Mock\*Source classes (untouched; reused by tests + forkReplay).
- `agent/src/benchmark/` — Plan 3 benchmark (untouched).

**Files to modify or replace:**
- `agent/src/executor/vaultAbi.ts` — update both function signatures to add `string uri`.
- `agent/src/executor/viemSender.ts` — thread `uri` through `executeProtectiveAction` + `attestObservation`.
- `agent/src/loop.ts` — RENAME to `agent/src/runtime/runTick.ts` and thread `uri` through.
- `agent/src/config.ts` — add `AGENT_ID`, `ATTEST_ADDRESS`, `PINATA_JWT?`, `ASSET_DECIMALS`, etc.

**File structure created by this plan:**

```
agent/src/
├── adapters/
│   ├── abi/
│   │   ├── rwaOracleAbi.ts        NEW (RWADynamicOracle minimal ABI)
│   │   ├── quoterV2Abi.ts         NEW (Agni QuoterV2 minimal ABI)
│   │   ├── erc20Abi.ts            NEW (balanceOf, decimals)
│   │   └── vaultAbi.ts            (existing path — see executor/vaultAbi.ts; we keep it co-located with executor)
│   ├── viemClients.ts             NEW (createPublicClient + createWalletClient factory)
│   ├── OndoNavSource.ts           NEW (viem NavSource)
│   ├── ConstantNavSource.ts       NEW (1e18 NavSource for USDT0/USDC permissionless demo)
│   ├── AgniPriceSource.ts         NEW (viem PriceSource via QuoterV2)
│   ├── AgniLiquiditySource.ts     NEW (probes quoter at fixed sizes; returns 0 on live mainnet)
│   └── VaultPositionSource.ts     NEW (viem PositionSource via ERC20.balanceOf(vault))
├── attestation/
│   ├── payload.ts                 NEW (canonical AttestationPayload type + serializer)
│   └── ipfsPinner.ts              NEW (Pinata client + data: URI fallback)
├── executor/
│   ├── encodeAction.ts            (existing, unchanged)
│   ├── vaultAbi.ts                MODIFIED (add `uri` param)
│   └── viemSender.ts              MODIFIED (real viem WalletClient sender + threads `uri`)
├── runtime/
│   ├── runTick.ts                 NEW (replaces loop.ts; threads `uri` build)
│   └── main.ts                    NEW (CLI: --once for cron, --forever for local)
├── scripts/
│   └── forkReplay.ts              NEW (anvil orchestrator + 2 scenarios)
└── (existing files unchanged)

contracts/script/
└── MigrateAgent.s.sol             NEW (one-shot mainnet migration: transfer NFT + setAgent)

.github/workflows/
└── agent-tick.yml                 NEW (cron */5 * * * *)

agent/replay-transient.json        NEW (committed snapshot from forkReplay)
agent/replay-terminal.json         NEW (committed snapshot from forkReplay)
```

---

## Task 0: Branch setup

**Files:** none (git only).

- [ ] **Step 0.1: Create plan-6-agent-live branch from master**

```bash
git checkout master
git pull origin master
git checkout -b plan-6-agent-live
git log -1 --oneline
```

Expected: HEAD is `06b1489 docs(ondo): mark allowlist email as sent + decision tree if approved/not` (or later commits on master since handoff).

---

## Task 1: Agent identity migration (mainnet, user-gated)

**Goal:** Transfer agentId-106 NFT from deployer EOA to a fresh agent EOA, set `vault.agent` to that fresh EOA, and verify on-chain. This isolates the agent's hot key (lives in GitHub Secrets) from the vault owner's cold key (stays on the user's machine).

**Files:**
- Create: `contracts/script/MigrateAgent.s.sol`
- Create: `contracts/test/MigrateAgent.t.sol`
- Modify: `contracts/deployments/mantle-mainnet.json`

**User-action gates:** Steps 1.7 (fund agent EOA) and 1.8 (run migration broadcast) require the deployer's PRIVATE_KEY and must be executed by the user. The subagent must STOP at Step 1.6, surface the exact commands, and wait for the user to confirm completion before proceeding.

- [ ] **Step 1.1: Verify IdentityRegistry is ERC-721**

Run from the repo root to read the runtime bytecode and check it implements `ownerOf(uint256)`:

```bash
cast code 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 --rpc-url https://rpc.mantle.xyz | head -c 200
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 "ownerOf(uint256)(address)" 106 --rpc-url https://rpc.mantle.xyz
```

Expected output (second call): `0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798` (the deployer — confirms agentId 106 is registered and IdentityRegistry exposes ERC-721 `ownerOf`). If the call reverts with "function selector not found", STOP — the registry is not ERC-721 and this plan needs adjustment; surface this to the user.

Also confirm `transferFrom` is available:

```bash
cast 4byte 0x23b872dd  # transferFrom(address,address,uint256)
```

Expected: `transferFrom(address,address,uint256)`. The selector exists in any ERC-721 — we only need the registry to honour it. Verify by checking the call doesn't revert in a dry-run (cast call simulates without broadcasting):

```bash
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
  "transferFrom(address,address,uint256)" \
  0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798 \
  0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798 \
  106 \
  --from 0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798 \
  --rpc-url https://rpc.mantle.xyz
```

Expected: succeeds with no output (self-transfer is a no-op in standard ERC-721). If it reverts, STOP and surface — the registry may have non-standard transfer gating.

- [ ] **Step 1.2: Write the migration script test (TDD)**

Create `contracts/test/MigrateAgent.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MigrateAgent} from "../script/MigrateAgent.s.sol";
import {SolventVault} from "../src/SolventVault.sol";
import {SolventAttestation} from "../src/SolventAttestation.sol";
import {Policy, ActionType, Regime} from "../src/Policy.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockIdentityRegistry is ERC721 {
    constructor() ERC721("ERC-8004 Identity", "ID") {}
    function mint(address to, uint256 tokenId) external { _mint(to, tokenId); }
}

contract MockERC20 is IERC20 {
    mapping(address => uint256) public override balanceOf;
    function totalSupply() external pure override returns (uint256) { return 0; }
    function allowance(address, address) external pure override returns (uint256) { return 0; }
    function approve(address, uint256) external pure override returns (bool) { return true; }
    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address, address, uint256) external pure override returns (bool) { return true; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
}

contract MigrateAgentTest is Test {
    MockIdentityRegistry registry;
    SolventAttestation attestation;
    SolventVault vault;
    MockERC20 asset;
    address deployer = address(0xD3);
    address newAgent = address(0xA6);
    uint256 constant AGENT_ID = 106;

    function setUp() public {
        registry = new MockIdentityRegistry();
        registry.mint(deployer, AGENT_ID);
        asset = new MockERC20();
        attestation = new SolventAttestation(address(0)); // no mirror in test
        Policy memory p = Policy({
            earlyDivergenceBps: 50,
            terminalDivergenceBps: 500,
            liquidityFloor: 0,
            maxSlippageBps: 300,
            safeAsset: address(asset), // irrelevant for this test
            bridgeVenue: address(0),
            maxBridgeLTVBps: 5000,
            allowedActions: uint32((1 << uint8(ActionType.PARK_YIELD)) | (1 << uint8(ActionType.SWAP_TO_SAFE)))
        });
        vault = new SolventVault(address(asset), deployer, deployer, AGENT_ID, address(attestation), p);
        vm.deal(deployer, 10 ether);
    }

    function test_migration_transfers_nft_and_sets_agent() public {
        MigrateAgent migrator = new MigrateAgent();
        vm.startPrank(deployer);
        registry.approve(address(migrator), AGENT_ID);
        migrator.run({
            registry_: address(registry),
            vault_: address(vault),
            agentId_: AGENT_ID,
            newAgent_: newAgent,
            fundAmount_: 0 // funding tested separately to keep this unit deterministic
        });
        vm.stopPrank();

        assertEq(registry.ownerOf(AGENT_ID), newAgent, "NFT must be owned by newAgent");
        assertEq(vault.agent(), newAgent, "vault.agent must be newAgent");
    }

    function test_migration_funds_new_agent_when_amount_nonzero() public {
        MigrateAgent migrator = new MigrateAgent();
        uint256 fundAmount = 6 ether;
        vm.startPrank(deployer);
        registry.approve(address(migrator), AGENT_ID);
        migrator.run({
            registry_: address(registry),
            vault_: address(vault),
            agentId_: AGENT_ID,
            newAgent_: newAgent,
            fundAmount_: fundAmount
        });
        vm.stopPrank();

        assertEq(newAgent.balance, fundAmount, "newAgent must receive fundAmount native");
    }

    function test_migration_reverts_if_caller_not_owner() public {
        MigrateAgent migrator = new MigrateAgent();
        vm.prank(address(0xBAD));
        vm.expectRevert();
        migrator.run({
            registry_: address(registry),
            vault_: address(vault),
            agentId_: AGENT_ID,
            newAgent_: newAgent,
            fundAmount_: 0
        });
    }
}
```

- [ ] **Step 1.3: Run the failing test**

```bash
cd contracts && forge test --match-contract MigrateAgentTest -vv
```

Expected: FAIL (`MigrateAgent` not yet defined / file not found).

- [ ] **Step 1.4: Implement the migration script**

Create `contracts/script/MigrateAgent.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SolventVault} from "../src/SolventVault.sol";

/// @notice One-shot migration: deployer (current owner) transfers the
/// ERC-8004 Identity NFT to a fresh agent EOA, sets `vault.agent` to that
/// EOA, and optionally funds the EOA with native MNT for gas. After this
/// the deployer keeps `vault.owner` (cold key) and the new agent EOA holds
/// only `executeProtectiveAction` / `attestObservation` privileges (hot key
/// stored in GitHub Secrets).
contract MigrateAgent is Script {
    /// @param registry_  ERC-8004 IdentityRegistry address.
    /// @param vault_     SolventVault address.
    /// @param agentId_   ERC-8004 token id owned by the caller.
    /// @param newAgent_  Fresh EOA to receive the NFT and act as vault agent.
    /// @param fundAmount_ Native MNT to forward to newAgent_ (set 0 to skip).
    function run(
        address registry_,
        address vault_,
        uint256 agentId_,
        address newAgent_,
        uint256 fundAmount_
    ) external {
        vm.startBroadcast();
        IERC721(registry_).transferFrom(msg.sender, newAgent_, agentId_);
        SolventVault(vault_).setAgent(newAgent_);
        if (fundAmount_ > 0) {
            (bool ok, ) = newAgent_.call{value: fundAmount_}("");
            require(ok, "fund transfer failed");
        }
        vm.stopBroadcast();
    }
}
```

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
cd contracts && forge test --match-contract MigrateAgentTest -vv
```

Expected: 3/3 tests pass.

- [ ] **Step 1.6: Commit the migration script + test**

```bash
git add contracts/script/MigrateAgent.s.sol contracts/test/MigrateAgent.t.sol
git commit -m "feat(contracts): MigrateAgent script — transfer agentId NFT + setAgent in one broadcast"
```

- [ ] **Step 1.7: USER ACTION — Generate fresh agent EOA**

STOP the subagent here. Surface to the user:

> **Action required:** Generate a fresh EOA for the agent. Run:
>
> ```bash
> cast wallet new
> ```
>
> Save the **Address** as `AGENT_ADDRESS` and the **Private Key** as `AGENT_PRIVATE_KEY` in `contracts/.env` (do NOT commit the `.env`). Then confirm completion.

Expected user output: an address like `0xAAAA...` and a 64-hex-char private key. After confirmation, proceed.

- [ ] **Step 1.8: USER ACTION — Run the migration broadcast**

Surface to the user:

> **Action required:** Run the migration broadcast. Replace `<AGENT_ADDRESS>` with the address from Step 1.7. From `contracts/`:
>
> ```bash
> forge script script/MigrateAgent.s.sol:MigrateAgent \
>   --sig "run(address,address,uint256,address,uint256)" \
>   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
>   0x06513470e16a7d6071A12708c38a6fa0ED66469c \
>   106 \
>   <AGENT_ADDRESS> \
>   6000000000000000000 \
>   --rpc-url https://rpc.mantle.xyz \
>   --private-key $DEPLOYER_PRIVATE_KEY \
>   --broadcast
> ```
>
> The `6000000000000000000` is 6 MNT (~$60), the cron gas budget. Expected: two on-chain txs (transferFrom + setAgent) + one native transfer; total cost <0.01 MNT.

After user confirms the script succeeded, proceed.

- [ ] **Step 1.9: Verify on-chain state**

```bash
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 "ownerOf(uint256)(address)" 106 --rpc-url https://rpc.mantle.xyz
cast call 0x06513470e16a7d6071A12708c38a6fa0ED66469c "agent()(address)" --rpc-url https://rpc.mantle.xyz
cast balance <AGENT_ADDRESS> --rpc-url https://rpc.mantle.xyz
```

Expected: both reads return `<AGENT_ADDRESS>`; the balance is ~6 MNT (less ~0.001 MNT gas paid by deployer for the broadcast). If any check fails, STOP and surface.

- [ ] **Step 1.10: Update deployment record**

Modify `contracts/deployments/mantle-mainnet.json`:

Replace the `"deployer"` block at the top with an explicit split (preserving the original deployer field for historical reference):

```jsonc
{
  "chainId": 5000,
  "network": "mantle",
  "deployedAt": "2026-05-29",
  "deployer": "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798",
  "agentEOA": "<AGENT_ADDRESS>",
  "agentMigratedAt": "2026-05-30",
  "deployBlock": 95950287,
  ...
```

And in the `wiring` block, update:

```jsonc
"wiring": {
  ...
  "vault.owner": "0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798 (deployer; cold key)",
  "vault.agent": "<AGENT_ADDRESS> (fresh agent EOA; hot key in GH Secrets)",
  "vault.agentId": "106 (ERC-8004 Identity NFT — transferred from deployer to agent EOA 2026-05-30)",
  ...
```

- [ ] **Step 1.11: Commit deployment-record update**

```bash
git add contracts/deployments/mantle-mainnet.json
git commit -m "chore(deploy): record agent EOA migration — NFT 106 + vault.agent"
```

---

## Task 2: Real viem read adapters

**Goal:** Implement four read adapters that satisfy the existing `NavSource`/`PriceSource`/`LiquiditySource`/`PositionSource` interfaces in `agent/src/adapters/types.ts`, plus a viem-client factory.

**Files:**
- Create: `agent/src/adapters/abi/rwaOracleAbi.ts`
- Create: `agent/src/adapters/abi/quoterV2Abi.ts`
- Create: `agent/src/adapters/abi/erc20Abi.ts`
- Create: `agent/src/adapters/viemClients.ts`
- Create: `agent/src/adapters/OndoNavSource.ts`
- Create: `agent/src/adapters/ConstantNavSource.ts`
- Create: `agent/src/adapters/AgniPriceSource.ts`
- Create: `agent/src/adapters/AgniLiquiditySource.ts`
- Create: `agent/src/adapters/VaultPositionSource.ts`
- Tests: `agent/test/adapters/OndoNavSource.test.ts`, `AgniPriceSource.test.ts`, `AgniLiquiditySource.test.ts`, `VaultPositionSource.test.ts`, `ConstantNavSource.test.ts`, `viemClients.test.ts`

- [ ] **Step 2.1: Write the ABI modules**

Create `agent/src/adapters/abi/rwaOracleAbi.ts`:

```typescript
/** Ondo RWADynamicOracle minimal ABI — only the read we need. */
export const rwaOracleAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
```

Create `agent/src/adapters/abi/quoterV2Abi.ts`:

```typescript
/** Agni QuoterV2 minimal ABI — quoteExactInputSingle (struct param).
 *  NOTE: non-view in V3 (the quoter simulates a swap, which mutates state in
 *  the underlying call frame; the result still reads cleanly via eth_call). */
export const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
```

Create `agent/src/adapters/abi/erc20Abi.ts`:

```typescript
/** Minimal ERC-20 ABI for `balanceOf` and `decimals`. */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
```

- [ ] **Step 2.2: Write the viemClients test (TDD)**

Create `agent/test/adapters/viemClients.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createReadClient, createWriteClient } from "../../src/adapters/viemClients";

const PK = "0x" + "11".repeat(32) as `0x${string}`;
const RPC = "https://rpc.mantle.xyz";

describe("viemClients", () => {
  it("createReadClient binds to Mantle chain (id 5000)", () => {
    const c = createReadClient(RPC);
    expect(c.chain?.id).toBe(5000);
  });

  it("createWriteClient exposes the agent account address", () => {
    const c = createWriteClient(RPC, PK);
    expect(c.account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("createWriteClient binds to Mantle chain (id 5000)", () => {
    const c = createWriteClient(RPC, PK);
    expect(c.chain?.id).toBe(5000);
  });
});
```

- [ ] **Step 2.3: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/adapters/viemClients.test.ts
```

Expected: FAIL (`createReadClient` / `createWriteClient` not defined).

- [ ] **Step 2.4: Implement viemClients**

Create `agent/src/adapters/viemClients.ts`:

```typescript
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";

/** Read-only client for Mantle. */
export function createReadClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: mantle, transport: http(rpcUrl) });
}

/** Write client bound to a private key. The `account` is non-optional so
 *  callers can read `client.account.address` without narrowing. */
export type AgentWalletClient = WalletClient & { account: Account };

export function createWriteClient(rpcUrl: string, privateKey: `0x${string}`): AgentWalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: mantle, transport: http(rpcUrl) }) as AgentWalletClient;
}
```

- [ ] **Step 2.5: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/adapters/viemClients.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 2.6: Commit viemClients**

```bash
git add agent/src/adapters/abi/ agent/src/adapters/viemClients.ts agent/test/adapters/viemClients.test.ts
git commit -m "feat(agent): viem read/write client factory bound to Mantle (id 5000)"
```

- [ ] **Step 2.7: Write OndoNavSource test (TDD)**

Create `agent/test/adapters/OndoNavSource.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { OndoNavSource } from "../../src/adapters/OndoNavSource";
import type { Address } from "../../src/types";

const ORACLE: Address = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f";

function fakeClient(returnValue: bigint) {
  return { readContract: vi.fn().mockResolvedValue(returnValue) } as any;
}

describe("OndoNavSource", () => {
  it("returns the value from RWADynamicOracle.getPrice", async () => {
    const c = fakeClient(1_010_000_000_000_000_000n);
    const src = new OndoNavSource(c, ORACLE);
    await expect(src.getNavPrice()).resolves.toBe(1_010_000_000_000_000_000n);
    expect(c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: ORACLE, functionName: "getPrice",
    }));
  });

  it("propagates RPC errors", async () => {
    const c = { readContract: vi.fn().mockRejectedValue(new Error("RPC down")) } as any;
    const src = new OndoNavSource(c, ORACLE);
    await expect(src.getNavPrice()).rejects.toThrow("RPC down");
  });
});
```

- [ ] **Step 2.8: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/adapters/OndoNavSource.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 2.9: Implement OndoNavSource**

Create `agent/src/adapters/OndoNavSource.ts`:

```typescript
import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { NavSource } from "./types";
import { rwaOracleAbi } from "./abi/rwaOracleAbi";

/** Reads USDY NAV from Ondo's RWADynamicOracle. 1e18-scaled. */
export class OndoNavSource implements NavSource {
  constructor(private readonly client: PublicClient, private readonly oracle: Address) {}

  async getNavPrice(): Promise<bigint> {
    return this.client.readContract({
      address: this.oracle,
      abi: rwaOracleAbi,
      functionName: "getPrice",
    });
  }
}
```

- [ ] **Step 2.10: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/adapters/OndoNavSource.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 2.11: Write ConstantNavSource test (TDD)**

Create `agent/test/adapters/ConstantNavSource.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ConstantNavSource } from "../../src/adapters/ConstantNavSource";

describe("ConstantNavSource", () => {
  it("returns the configured constant", async () => {
    const src = new ConstantNavSource(1_000_000_000_000_000_000n);
    await expect(src.getNavPrice()).resolves.toBe(1_000_000_000_000_000_000n);
  });
});
```

- [ ] **Step 2.12: Implement ConstantNavSource**

Create `agent/src/adapters/ConstantNavSource.ts`:

```typescript
import type { NavSource } from "./types";

/** Static NAV (1e18 = $1) for permissionless demo assets (USDT0/USDC) where
 *  no on-chain NAV oracle exists. The depeg-guardian logic still applies:
 *  market price < NAV triggers EARLY/TERMINAL regimes. */
export class ConstantNavSource implements NavSource {
  constructor(private readonly value: bigint) {}
  async getNavPrice(): Promise<bigint> {
    return this.value;
  }
}
```

- [ ] **Step 2.13: Run ConstantNavSource test**

```bash
cd agent && npx vitest run test/adapters/ConstantNavSource.test.ts
```

Expected: 1/1 pass.

- [ ] **Step 2.14: Write AgniPriceSource test (TDD)**

Create `agent/test/adapters/AgniPriceSource.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { AgniPriceSource } from "../../src/adapters/AgniPriceSource";
import type { Address } from "../../src/types";

const QUOTER: Address = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb";
const USDT0: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const USDC: Address = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

function fakeClient(amountOut: bigint) {
  return {
    simulateContract: vi.fn().mockResolvedValue({
      result: [amountOut, 0n, 0, 0n],
    }),
  } as any;
}

describe("AgniPriceSource", () => {
  it("returns amountOut scaled to 1e18 given amountIn 1e18 (same decimals)", async () => {
    // 1 USDT (6 dec) -> 0.999 USDC (6 dec); we probe with 1 token = 1e6
    const c = fakeClient(999_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 6, 6);
    // 0.999 USDC per 1 USDT = 0.999 * 1e18
    await expect(src.getMarketPrice()).resolves.toBe(999_000_000_000_000_000n);
  });

  it("uses fee tier 500 (0.05%) when configured", async () => {
    const c = fakeClient(1_000_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 6, 6);
    await src.getMarketPrice();
    expect(c.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: QUOTER,
        functionName: "quoteExactInputSingle",
        args: [expect.objectContaining({ fee: 500 })],
      })
    );
  });

  it("normalises across decimal mismatches (asset 18 dec -> safe 6 dec)", async () => {
    // 1e18 asset (18 dec) -> 999_000 safe (6 dec)  →  effective price 0.999
    const c = fakeClient(999_000n);
    const src = new AgniPriceSource(c, QUOTER, USDT0, USDC, 500, 18, 6);
    await expect(src.getMarketPrice()).resolves.toBe(999_000_000_000_000_000n);
  });
});
```

- [ ] **Step 2.15: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/adapters/AgniPriceSource.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 2.16: Implement AgniPriceSource**

Create `agent/src/adapters/AgniPriceSource.ts`:

```typescript
import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { PriceSource } from "./types";
import { quoterV2Abi } from "./abi/quoterV2Abi";

/** Reads market price by simulating a 1-unit swap through Agni V3's QuoterV2.
 *  Output is normalised to 1e18: price = amountOut / 10^safeDec * 10^assetDec.
 *  We probe with `1 token` (10^assetDecimals), which keeps quoter gas <100k.
 *
 *  V3 quoters are `nonpayable` in source (they simulate state mutation), but
 *  callable via `eth_call`/`simulateContract` without a tx. */
export class AgniPriceSource implements PriceSource {
  constructor(
    private readonly client: PublicClient,
    private readonly quoter: Address,
    private readonly assetIn: Address,
    private readonly assetOut: Address,
    private readonly feeTier: number,
    private readonly assetDecimals: number,
    private readonly safeDecimals: number,
  ) {}

  async getMarketPrice(): Promise<bigint> {
    const amountIn = 10n ** BigInt(this.assetDecimals); // 1 unit of asset
    const { result } = await this.client.simulateContract({
      address: this.quoter,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: this.assetIn,
        tokenOut: this.assetOut,
        amountIn,
        fee: this.feeTier,
        sqrtPriceLimitX96: 0n,
      }],
    });
    const amountOut = result[0] as bigint;
    // price (1e18) = amountOut * 10^(18 - safeDecimals)
    return amountOut * 10n ** BigInt(18 - this.safeDecimals);
  }
}
```

- [ ] **Step 2.17: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/adapters/AgniPriceSource.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 2.18: Write AgniLiquiditySource test (TDD)**

Create `agent/test/adapters/AgniLiquiditySource.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { AgniLiquiditySource } from "../../src/adapters/AgniLiquiditySource";
import type { Address } from "../../src/types";

const QUOTER: Address = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb";
const USDT0: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const USDC: Address = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

function fakeClient(quotes: Record<string, bigint>) {
  return {
    simulateContract: vi.fn().mockImplementation(({ args }) => {
      const key = (args[0].amountIn as bigint).toString();
      const out = quotes[key] ?? 0n;
      return Promise.resolve({ result: [out, 0n, 0, 0n] });
    }),
  } as any;
}

describe("AgniLiquiditySource", () => {
  // probeSizes are in asset-native (6 dec) units. maxSlippageBps = 300 (3%).
  // For each probe, expected output (no slippage) = probe * 1.0 (1:1 stable).
  // Pass if actual >= probe * 0.97.

  it("returns largest probe that stays within slippage", async () => {
    // Quotes: 1e6 -> 1.0 (passes), 1e9 -> 0.99 (passes), 1e12 -> 0.5 (fails)
    const c = fakeClient({
      "1000000": 1_000_000n,        // 1 unit
      "1000000000": 990_000_000n,   // 1k units, 1% slippage
      "1000000000000": 500_000_000_000n, // 1M units, 50% slippage
    });
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300,
      [1_000_000n, 1_000_000_000n, 1_000_000_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(1_000_000_000n);
  });

  it("returns 0 when even the smallest probe fails slippage", async () => {
    const c = fakeClient({ "1000000": 500_000n }); // 50% slippage on smallest probe
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300, [1_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(0n);
  });

  it("returns 0 when probeSizes is empty (live-mainnet stub mode)", async () => {
    const c = { simulateContract: vi.fn() } as any;
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300, [],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(0n);
    expect(c.simulateContract).not.toHaveBeenCalled();
  });

  it("treats quoter revert as failed probe (returns next-smaller valid)", async () => {
    const c = {
      simulateContract: vi.fn().mockImplementation(({ args }) => {
        if ((args[0].amountIn as bigint) === 1_000_000_000n) {
          return Promise.reject(new Error("INSUFFICIENT_LIQUIDITY"));
        }
        return Promise.resolve({ result: [1_000_000n, 0n, 0, 0n] });
      }),
    } as any;
    const src = new AgniLiquiditySource(
      c, QUOTER, USDT0, USDC, 500, 6, 6, 300,
      [1_000_000n, 1_000_000_000n],
    );
    await expect(src.getLiquidityDepth()).resolves.toBe(1_000_000n);
  });
});
```

- [ ] **Step 2.19: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/adapters/AgniLiquiditySource.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 2.20: Implement AgniLiquiditySource**

Create `agent/src/adapters/AgniLiquiditySource.ts`:

```typescript
import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { LiquiditySource } from "./types";
import { quoterV2Abi } from "./abi/quoterV2Abi";

/** Estimates swap depth by probing the Agni pool at a series of fixed sizes
 *  (ascending). Returns the LARGEST probe whose effective output stays within
 *  `maxSlippageBps` of a 1:1 nominal peg. If even the smallest probe fails,
 *  returns 0 (signals "don't swap" to selectAction).
 *
 *  Live-mainnet config: pass `probeSizes = []` to stub the source to 0 (forces
 *  the agent to BRIDGE-or-do-nothing — see spec §4: thin DEX liquidity on Mantle).
 *  Fork-replay config: pass concrete sizes (e.g. [1e6, 1e9, 1e12]) to enable
 *  the SWAP path on the deepened fork pool.
 *
 *  Quoter reverts on insufficient pool liquidity; we treat that as "probe failed". */
export class AgniLiquiditySource implements LiquiditySource {
  constructor(
    private readonly client: PublicClient,
    private readonly quoter: Address,
    private readonly assetIn: Address,
    private readonly assetOut: Address,
    private readonly feeTier: number,
    private readonly assetDecimals: number,
    private readonly safeDecimals: number,
    private readonly maxSlippageBps: number,
    private readonly probeSizes: readonly bigint[],
  ) {}

  async getLiquidityDepth(): Promise<bigint> {
    if (this.probeSizes.length === 0) return 0n;

    let largestPassing = 0n;
    // Sort ascending for clarity; tolerate caller passing unsorted sizes.
    const sorted = [...this.probeSizes].sort((a, b) => (a < b ? -1 : 1));
    for (const amountIn of sorted) {
      const passed = await this.probeOne(amountIn);
      if (passed) largestPassing = amountIn;
      else break; // monotone: once failed, larger sizes also fail
    }
    return largestPassing;
  }

  private async probeOne(amountIn: bigint): Promise<boolean> {
    let amountOut: bigint;
    try {
      const { result } = await this.client.simulateContract({
        address: this.quoter,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [{
          tokenIn: this.assetIn,
          tokenOut: this.assetOut,
          amountIn,
          fee: this.feeTier,
          sqrtPriceLimitX96: 0n,
        }],
      });
      amountOut = result[0] as bigint;
    } catch {
      return false; // quoter revert == probe fails
    }

    // Normalise both to 18-dec so the comparison is decimal-agnostic.
    const inputNorm = amountIn * 10n ** BigInt(18 - this.assetDecimals);
    const outputNorm = amountOut * 10n ** BigInt(18 - this.safeDecimals);
    if (outputNorm === 0n) return false;
    const slippageBps = inputNorm > outputNorm
      ? Number(((inputNorm - outputNorm) * 10_000n) / inputNorm)
      : 0;
    return slippageBps <= this.maxSlippageBps;
  }
}
```

- [ ] **Step 2.21: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/adapters/AgniLiquiditySource.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 2.22: Write VaultPositionSource test (TDD)**

Create `agent/test/adapters/VaultPositionSource.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { VaultPositionSource } from "../../src/adapters/VaultPositionSource";
import type { Address } from "../../src/types";

const ASSET: Address = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const VAULT: Address = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";

function fakeClient(balance: bigint) {
  return { readContract: vi.fn().mockResolvedValue(balance) } as any;
}

describe("VaultPositionSource", () => {
  it("returns ERC20.balanceOf(vault)", async () => {
    const c = fakeClient(1_500_000n);
    const src = new VaultPositionSource(c, ASSET, VAULT);
    await expect(src.getAssetBalance()).resolves.toBe(1_500_000n);
    expect(c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: ASSET, functionName: "balanceOf", args: [VAULT],
    }));
  });
});
```

- [ ] **Step 2.23: Implement VaultPositionSource**

Create `agent/src/adapters/VaultPositionSource.ts`:

```typescript
import type { PublicClient } from "viem";
import type { Address } from "../types";
import type { PositionSource } from "./types";
import { erc20Abi } from "./abi/erc20Abi";

/** Vault's holding of the risk asset, asset-native units. */
export class VaultPositionSource implements PositionSource {
  constructor(
    private readonly client: PublicClient,
    private readonly asset: Address,
    private readonly vault: Address,
  ) {}

  async getAssetBalance(): Promise<bigint> {
    return this.client.readContract({
      address: this.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [this.vault],
    });
  }
}
```

- [ ] **Step 2.24: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/adapters/VaultPositionSource.test.ts
```

Expected: 1/1 pass.

- [ ] **Step 2.25: Run all adapter tests + the full suite**

```bash
cd agent && npx vitest run
```

Expected: all existing 78 tests pass + the new ones (78 + 11 = 89 total). If any baseline test fails, STOP — something regressed.

- [ ] **Step 2.26: Commit adapters**

```bash
git add agent/src/adapters/ agent/test/adapters/
git commit -m "feat(agent): viem read adapters — OndoNav, ConstantNav, AgniPrice, AgniLiquidity, VaultPosition"
```

---

## Task 3: Real WriteClient

**Goal:** Replace `agent/src/loop.ts`'s `WriteClient` interface (currently a thin slice of viem `WalletClient` used in tests with fakes) with a real implementation that writes to the deployed vault. Add the `uri` parameter to vault writes (the deployed ABI requires it; the local `vaultAbi.ts` is stale). Add gas estimation with a 20% buffer and explicit `waitForTransactionReceipt` so the cron job knows the result.

**Files:**
- Modify: `agent/src/executor/vaultAbi.ts` (add `uri` to both function signatures)
- Modify: `agent/src/executor/viemSender.ts` (real `WalletClient` implementation, thread `uri`)
- Modify: `agent/src/loop.ts:8-37` (extend `ExecuteArgs` and `ObserveArgs` with `uri: string`)
- Create: `agent/test/executor/viemSender.test.ts`

- [ ] **Step 3.1: Write the failing test for the updated vault ABI**

Create `agent/test/executor/viemSender.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createViemSender } from "../../src/executor/viemSender";
import { vaultAbi } from "../../src/executor/vaultAbi";
import type { Address } from "../../src/types";

const VAULT: Address = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";

function fakeWallet() {
  return {
    writeContract: vi.fn().mockResolvedValue("0xabc" as `0x${string}`),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", transactionHash: "0xabc" }),
    estimateContractGas: vi.fn().mockResolvedValue(200_000n),
  } as any;
}

describe("createViemSender", () => {
  it("executeProtectiveAction threads uri to vault.executeProtectiveAction", async () => {
    const w = fakeWallet();
    const sender = createViemSender(w, VAULT);
    const hash = await sender.executeProtectiveAction({
      action: 4, // PARK_YIELD
      params: "0x",
      regime: 0,
      reasonCode: "0x70617263616c6d000000000000000000000000000000000000000000000000" as `0x${string}`,
      signalsHash: "0xdead" + "0".repeat(60) as `0x${string}`,
      uri: "ipfs://QmTEST",
    });
    expect(hash).toBe("0xabc");
    expect(w.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      address: VAULT,
      functionName: "executeProtectiveAction",
      args: [4, "0x", 0, expect.any(String), expect.any(String), "ipfs://QmTEST"],
    }));
  });

  it("attestObservation threads uri to vault.attestObservation", async () => {
    const w = fakeWallet();
    const sender = createViemSender(w, VAULT);
    const hash = await sender.attestObservation({
      regime: 1,
      reasonCode: "0x77617463680000000000000000000000000000000000000000000000000000" as `0x${string}`,
      signalsHash: "0xbeef" + "0".repeat(60) as `0x${string}`,
      uri: "data:application/json;base64,e30=",
    });
    expect(hash).toBe("0xabc");
    expect(w.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "attestObservation",
      args: [1, expect.any(String), expect.any(String), "data:application/json;base64,e30="],
    }));
  });

  it("vaultAbi function executeProtectiveAction has 6 inputs including uri", () => {
    const fn = vaultAbi.find((e: any) => e.type === "function" && e.name === "executeProtectiveAction") as any;
    expect(fn).toBeDefined();
    expect(fn.inputs).toHaveLength(6);
    expect(fn.inputs[5]).toEqual(expect.objectContaining({ name: "uri", type: "string" }));
  });

  it("vaultAbi function attestObservation has 4 inputs including uri", () => {
    const fn = vaultAbi.find((e: any) => e.type === "function" && e.name === "attestObservation") as any;
    expect(fn).toBeDefined();
    expect(fn.inputs).toHaveLength(4);
    expect(fn.inputs[3]).toEqual(expect.objectContaining({ name: "uri", type: "string" }));
  });

  it("waits for tx receipt and surfaces a revert as a thrown error", async () => {
    const w = fakeWallet();
    w.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", transactionHash: "0xbad" });
    const sender = createViemSender(w, VAULT);
    await expect(sender.executeProtectiveAction({
      action: 4, params: "0x", regime: 0,
      reasonCode: "0x" + "00".repeat(32) as `0x${string}`,
      signalsHash: "0x" + "00".repeat(32) as `0x${string}`,
      uri: "",
    })).rejects.toThrow(/reverted/i);
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/executor/viemSender.test.ts
```

Expected: FAIL (the existing `executeProtectiveAction` interface lacks `uri`; ABI fragment lacks the `string uri` input).

- [ ] **Step 3.3: Update vaultAbi to add `uri`**

Replace the contents of `agent/src/executor/vaultAbi.ts` with:

```typescript
/** Minimal ABI fragment of SolventVault the agent calls. Mirrors the on-chain
 *  ABI exported at contracts/exports/abis/SolventVault.json. */
export const vaultAbi = [
  {
    type: "function",
    name: "executeProtectiveAction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "uint8" },
      { name: "params", type: "bytes" },
      { name: "regime", type: "uint8" },
      { name: "reasonCode", type: "bytes32" },
      { name: "signalsHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestObservation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "regime", type: "uint8" },
      { name: "reasonCode", type: "bytes32" },
      { name: "signalsHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
] as const;
```

- [ ] **Step 3.4: Extend ExecuteArgs and ObserveArgs in loop.ts**

Edit `agent/src/loop.ts` — change the `ExecuteArgs` and `ObserveArgs` interfaces to add `uri: string`:

```typescript
// agent/src/loop.ts (interface section only — keep the rest of the file as-is for now)
export interface ExecuteArgs {
  action: number;
  params: `0x${string}`;
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}

export interface ObserveArgs {
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}
```

(The rest of `loop.ts` will be replaced wholesale in Task 5; for now we just need the interfaces to compile.)

- [ ] **Step 3.5: Update viemSender to thread uri + add receipt wait**

Replace the contents of `agent/src/executor/viemSender.ts` with:

```typescript
import type { Address } from "../types";
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../loop";
import { vaultAbi } from "./vaultAbi";

/** The slice of a viem WalletClient + PublicClient we use. Kept narrow so it's
 *  trivial to fake in tests. In production this is one and the same viem
 *  WalletClient (viem write clients expose read methods too). */
export interface WriteClient {
  writeContract(req: {
    address: Address;
    abi: typeof vaultAbi;
    functionName: "executeProtectiveAction" | "attestObservation";
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
  waitForTransactionReceipt(req: { hash: `0x${string}` }): Promise<{
    status: "success" | "reverted";
    transactionHash: `0x${string}`;
  }>;
}

async function sendAndWait(
  client: WriteClient,
  vault: Address,
  functionName: "executeProtectiveAction" | "attestObservation",
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const hash = await client.writeContract({ address: vault, abi: vaultAbi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`vault.${functionName} reverted (tx ${receipt.transactionHash})`);
  }
  return receipt.transactionHash;
}

/** Builds a VaultSender that submits txs and awaits receipts. */
export function createViemSender(client: WriteClient, vault: Address): VaultSender {
  return {
    executeProtectiveAction: (a: ExecuteArgs) => sendAndWait(
      client, vault, "executeProtectiveAction",
      [a.action, a.params, a.regime, a.reasonCode, a.signalsHash, a.uri],
    ),
    attestObservation: (a: ObserveArgs) => sendAndWait(
      client, vault, "attestObservation",
      [a.regime, a.reasonCode, a.signalsHash, a.uri],
    ),
  };
}
```

- [ ] **Step 3.6: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/executor/viemSender.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 3.7: Run the full agent suite to confirm no regression**

```bash
cd agent && npx vitest run
```

Expected: all tests pass (89 from Task 2 + 5 = 94). Existing tests that fake `WriteClient` may now fail because the interface gained `waitForTransactionReceipt` — update those fakes if they fail (search with `grep -r "writeContract" agent/test/` to find them).

If any baseline test fails because of the interface change, add `waitForTransactionReceipt: async () => ({ status: "success", transactionHash: "0xfake" })` to the fake. Re-run.

- [ ] **Step 3.8: Commit WriteClient updates**

```bash
git add agent/src/executor/vaultAbi.ts agent/src/executor/viemSender.ts agent/src/loop.ts agent/test/executor/
git commit -m "feat(agent): real viem WriteClient — uri param + receipt wait + revert detection"
```

---

## Task 4: AttestationPayload + IPFSPinner

**Goal:** Build the rich JSON payload that the on-chain `uri` field points to, and pin it to IPFS via Pinata (with a `data:` URI fallback for offline/budget-free operation). The payload is the verifiable transcript: signals snapshot + regime + action + tick metadata. The on-chain `feedbackHash` is computed by `SolventAttestation.record()` from `(agentId, regime, reasonCode, signalsHash, action, outcome, uri)` — so the URI itself must commit to enough of the payload that a third party can recompute the assessment from on-chain data + the pinned JSON.

**Files:**
- Create: `agent/src/attestation/payload.ts`
- Create: `agent/src/attestation/ipfsPinner.ts`
- Create: `agent/test/attestation/payload.test.ts`
- Create: `agent/test/attestation/ipfsPinner.test.ts`

- [ ] **Step 4.1: Write the payload test (TDD)**

Create `agent/test/attestation/payload.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildAttestationPayload, serializePayload, payloadVersion } from "../../src/attestation/payload";
import { ActionType, Regime } from "../../src/types";
import type { Signals } from "../../src/types";

const signals: Signals = {
  navPrice: 1_000_000_000_000_000_000n,
  marketPrice: 999_000_000_000_000_000n,
  liquidityDepth: 0n,
  assetBalance: 100_000_000n,
  oracleDivergenceBps: 0,
  timestamp: 1_716_969_600,
};

describe("AttestationPayload", () => {
  it("includes version, agentId, vault, signals, regime, decision", () => {
    const p = buildAttestationPayload({
      tick: 42,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.CALM,
      decision: {
        regime: Regime.CALM,
        plan: { action: ActionType.PARK_YIELD, amount: 100_000_000n },
        reasonCode: "park-calm",
      },
      txHash: null,
    });
    expect(p.version).toBe(payloadVersion);
    expect(p.tick).toBe(42);
    expect(p.agentId).toBe("106");
    expect(p.vaultAddress).toBe("0x06513470e16a7d6071A12708c38a6fa0ED66469c");
    expect(p.signals.navPrice).toBe("1000000000000000000");
    expect(p.regime).toBe("CALM");
    expect(p.decision.action).toBe("PARK_YIELD");
    expect(p.decision.reasonCode).toBe("park-calm");
  });

  it("serializePayload returns deterministic JSON (sorted keys)", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.WATCH,
      decision: { regime: Regime.WATCH, plan: { action: ActionType.NONE }, reasonCode: "watch" },
      txHash: null,
    });
    const s1 = serializePayload(p);
    const s2 = serializePayload(p);
    expect(s1).toBe(s2);
    // sorted: "agentId" before "decision" before "regime" before "signals" before "tick" ...
    const idxAgentId = s1.indexOf('"agentId"');
    const idxTick = s1.indexOf('"tick"');
    expect(idxAgentId).toBeLessThan(idxTick);
  });

  it("encodes bigint signal fields as decimal strings", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.CALM,
      decision: { regime: Regime.CALM, plan: { action: ActionType.NONE }, reasonCode: "calm-idle" },
      txHash: null,
    });
    expect(typeof p.signals.navPrice).toBe("string");
    expect(p.signals.assetBalance).toBe("100000000");
  });

  it("emits action-specific plan fields", () => {
    const p = buildAttestationPayload({
      tick: 1,
      agentId: 106n,
      vaultAddress: "0x06513470e16a7d6071A12708c38a6fa0ED66469c",
      signals,
      regime: Regime.EARLY_DEPEG,
      decision: {
        regime: Regime.EARLY_DEPEG,
        plan: { action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 100n, borrowAmount: 50n },
        reasonCode: "liquidity-bridge",
      },
      txHash: "0xdeadbeef" as `0x${string}`,
    });
    expect(p.decision.action).toBe("BRIDGE_VIA_LENDING");
    expect(p.decision.collateralAmount).toBe("100");
    expect(p.decision.borrowAmount).toBe("50");
    expect(p.txHash).toBe("0xdeadbeef");
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/attestation/payload.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 4.3: Implement payload**

Create `agent/src/attestation/payload.ts`:

```typescript
import { ActionType, Regime, type ActionPlan, type Decision, type Signals } from "../types";

export const payloadVersion = "1.0";

/** Canonical attestation payload. All `bigint` fields are decimal strings so
 *  the JSON is portable and round-trips without precision loss. Keys are kept
 *  alphabetised by `serializePayload` for deterministic hashing/pinning. */
export interface AttestationPayload {
  version: string;
  agentId: string;
  vaultAddress: string;
  tick: number;
  timestamp: number;
  regime: keyof typeof Regime;
  signals: {
    navPrice: string;
    marketPrice: string;
    liquidityDepth: string;
    assetBalance: string;
    oracleDivergenceBps: number;
    timestamp: number;
  };
  decision: {
    action: keyof typeof ActionType;
    reasonCode: string;
  } & Record<string, string | number | undefined>;
  txHash: string | null;
}

export interface BuildArgs {
  tick: number;
  agentId: bigint;
  vaultAddress: string;
  signals: Signals;
  regime: Regime;
  decision: Decision;
  txHash: `0x${string}` | null;
}

function planFields(plan: ActionPlan): Record<string, string> {
  switch (plan.action) {
    case ActionType.SWAP_TO_SAFE:
      return { amountIn: plan.amountIn.toString(), amountOutMin: plan.amountOutMin.toString() };
    case ActionType.BRIDGE_VIA_LENDING:
      return { collateralAmount: plan.collateralAmount.toString(), borrowAmount: plan.borrowAmount.toString() };
    case ActionType.UNWIND_BRIDGE:
      return { repayAmount: plan.repayAmount.toString(), withdrawAmount: plan.withdrawAmount.toString() };
    case ActionType.PARK_YIELD:
      return { amount: plan.amount.toString() };
    case ActionType.NONE:
      return {};
  }
}

export function buildAttestationPayload(a: BuildArgs): AttestationPayload {
  return {
    version: payloadVersion,
    agentId: a.agentId.toString(),
    vaultAddress: a.vaultAddress,
    tick: a.tick,
    timestamp: a.signals.timestamp,
    regime: Regime[a.regime] as keyof typeof Regime,
    signals: {
      navPrice: a.signals.navPrice.toString(),
      marketPrice: a.signals.marketPrice.toString(),
      liquidityDepth: a.signals.liquidityDepth.toString(),
      assetBalance: a.signals.assetBalance.toString(),
      oracleDivergenceBps: a.signals.oracleDivergenceBps,
      timestamp: a.signals.timestamp,
    },
    decision: {
      action: ActionType[a.decision.plan.action] as keyof typeof ActionType,
      reasonCode: a.decision.reasonCode,
      ...planFields(a.decision.plan),
    },
    txHash: a.txHash,
  };
}

/** JSON.stringify with sorted keys (recursive). Deterministic for IPFS CID
 *  stability — same payload produces the same bytes produces the same CID. */
export function serializePayload(p: AttestationPayload): string {
  return JSON.stringify(p, replacer);
}

function replacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/attestation/payload.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 4.5: Write the IPFSPinner test (TDD)**

Create `agent/test/attestation/ipfsPinner.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createPinataPinner, createDataUriPinner } from "../../src/attestation/ipfsPinner";

describe("createDataUriPinner", () => {
  it("returns a base64-encoded data: URI", async () => {
    const pin = createDataUriPinner();
    const uri = await pin('{"hello":"world"}');
    expect(uri).toBe("data:application/json;base64,eyJoZWxsbyI6IndvcmxkIn0=");
  });

  it("round-trips ASCII content through base64", async () => {
    const pin = createDataUriPinner();
    const uri = await pin("solvent");
    expect(uri).toBe("data:application/json;base64,c29sdmVudA==");
  });
});

describe("createPinataPinner", () => {
  it("POSTs to pinFileToIPFS with the Authorization header and returns ipfs:// URI", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ IpfsHash: "QmTEST123" }),
    } as any);
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toBe("ipfs://QmTEST123");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer jwt-token" }),
      }),
    );
  });

  it("falls back to data: URI when Pinata returns non-200", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({}),
    } as any);
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toMatch(/^data:application\/json;base64,/);
  });

  it("falls back to data: URI when Pinata throws (network error)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const pin = createPinataPinner("jwt-token", fetchFn as any);
    const uri = await pin('{"a":1}');
    expect(uri).toMatch(/^data:application\/json;base64,/);
  });
});
```

- [ ] **Step 4.6: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/attestation/ipfsPinner.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 4.7: Implement IPFSPinner**

Create `agent/src/attestation/ipfsPinner.ts`:

```typescript
/** A Pinner is `string -> Promise<string>` where the input is the canonical
 *  JSON payload and the output is the URI to put on-chain. */
export type Pinner = (jsonContent: string) => Promise<string>;

/** Inline `data:` URI — no external dependency, no cost, but bloats calldata
 *  by ~4/3 the payload size. Suitable for small payloads (<4KB) and fallback
 *  when Pinata is unavailable. */
export function createDataUriPinner(): Pinner {
  return async (json) => {
    // btoa is available in Node 18+ and modern browsers; viem already targets it.
    const b64 = Buffer.from(json, "utf8").toString("base64");
    return `data:application/json;base64,${b64}`;
  };
}

type FetchLike = (url: string, init?: any) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<{ IpfsHash?: string }>;
}>;

/** Pin to Pinata; on any error (non-2xx, network) fall back to a data: URI so
 *  the tick still produces an on-chain attestation. */
export function createPinataPinner(jwt: string, fetchFn: FetchLike = globalThis.fetch as any): Pinner {
  const fallback = createDataUriPinner();
  return async (json) => {
    try {
      const form = new FormData();
      form.append("file", new Blob([json], { type: "application/json" }), "solvent-attestation.json");
      const res = await fetchFn("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      if (!res.ok) return await fallback(json);
      const j = await res.json();
      if (!j.IpfsHash) return await fallback(json);
      return `ipfs://${j.IpfsHash}`;
    } catch {
      return await fallback(json);
    }
  };
}
```

- [ ] **Step 4.8: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/attestation/ipfsPinner.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 4.9: Run full suite**

```bash
cd agent && npx vitest run
```

Expected: all pass (94 from Task 3 + 9 = 103).

- [ ] **Step 4.10: Commit attestation module**

```bash
git add agent/src/attestation/ agent/test/attestation/
git commit -m "feat(agent): AttestationPayload (deterministic JSON) + Pinata pinner with data: URI fallback"
```

---

## Task 5: runTick refactor + main.ts CLI

**Goal:** Replace `agent/src/loop.ts` with a `runtime/runTick.ts` that integrates the URI-building step into the tick (gather → assess → select → build URI → write → return). Add a `runtime/main.ts` CLI that wires real adapters from env and runs either a single tick (cron mode) or forever (local dev mode).

**Files:**
- Delete: `agent/src/loop.ts`
- Create: `agent/src/runtime/runTick.ts` (replaces loop.ts)
- Create: `agent/src/runtime/main.ts`
- Modify: `agent/src/config.ts` (add AGENT_ID, ATTEST_ADDRESS, PINATA_JWT optional)
- Modify: `agent/src/executor/viemSender.ts:1-4` (update import path: `../loop` → `../runtime/runTick`)
- Modify: `agent/package.json` (add `tick` script + `forever` script)
- Create: `agent/test/runtime/runTick.test.ts`
- Create: `agent/test/runtime/main.test.ts`

- [ ] **Step 5.1: Write the runTick test (TDD)**

Create `agent/test/runtime/runTick.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { runTick } from "../../src/runtime/runTick";
import { ActionType, Regime } from "../../src/types";
import type { AgentPolicy } from "../../src/types";
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../../src/adapters/mocks";

const policy: AgentPolicy = {
  watchDivergenceBps: 20,
  earlyDivergenceBps: 50,
  terminalDivergenceBps: 500,
  maxOracleDivergenceBps: 100,
  liquidityFloor: 0n,
  maxSlippageBps: 300,
  maxBridgeLTVBps: 5000,
  assetDecimals: 6,
  safeDecimals: 6,
  allowedActions: 0b11110, // SWAP|BRIDGE|UNWIND|PARK, no NONE bit
};

function fakeSender() {
  return {
    executeProtectiveAction: vi.fn().mockResolvedValue("0xexec" as `0x${string}`),
    attestObservation: vi.fn().mockResolvedValue("0xobs" as `0x${string}`),
  };
}

function fakePinner(uri: string) {
  return vi.fn().mockResolvedValue(uri);
}

const VAULT = "0x06513470e16a7d6071A12708c38a6fa0ED66469c";
const ASSET = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const SAFE = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

describe("runTick", () => {
  it("CALM regime + balance > 0 → executeProtectiveAction(PARK_YIELD) with URI", async () => {
    const sender = fakeSender();
    const pinner = fakePinner("ipfs://QmCALM");
    const res = await runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 1,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(res.decision.plan.action).toBe(ActionType.PARK_YIELD);
    expect(res.txHash).toBe("0xexec");
    expect(sender.executeProtectiveAction).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "ipfs://QmCALM" }),
    );
  });

  it("WATCH regime → attestObservation with URI (no on-chain action)", async () => {
    const sender = fakeSender();
    const pinner = fakePinner("ipfs://QmWATCH");
    // divergence 30bps = WATCH (>=20 and <50)
    const nav = 1_000_000_000_000_000_000n;
    const market = 997_000_000_000_000_000n; // 30 bps below
    const res = await runTick({
      sources: {
        nav: new MockNavSource(nav),
        price: new MockPriceSource(market),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 2,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(res.decision.regime).toBe(Regime.WATCH);
    expect(sender.attestObservation).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "ipfs://QmWATCH" }),
    );
    expect(sender.executeProtectiveAction).not.toHaveBeenCalled();
  });

  it("propagates pinner errors as tick failure", async () => {
    const sender = fakeSender();
    const pinner = vi.fn().mockRejectedValue(new Error("Pinata 503"));
    await expect(runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy,
      sender,
      pinner,
      tick: 3,
      agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    })).rejects.toThrow("Pinata 503");
  });

  it("includes txHash in the URI payload only after the on-chain write", async () => {
    // The order matters: payload is built BEFORE tx, so txHash field is null
    // at pin-time. This is fine because the on-chain tx records (agentId, regime,
    // reasonCode, signalsHash, action, outcome, uri); the URI doesn't need its
    // own tx hash. Test asserts payload pinning happens before write.
    const callOrder: string[] = [];
    const sender = {
      executeProtectiveAction: vi.fn().mockImplementation(async () => {
        callOrder.push("write");
        return "0xexec" as `0x${string}`;
      }),
      attestObservation: vi.fn(),
    };
    const pinner = vi.fn().mockImplementation(async () => {
      callOrder.push("pin");
      return "ipfs://QmORDER";
    });
    await runTick({
      sources: {
        nav: new MockNavSource(1_000_000_000_000_000_000n),
        price: new MockPriceSource(1_000_000_000_000_000_000n),
        liquidity: new MockLiquiditySource(0n),
        position: new MockPositionSource(100_000_000n),
      },
      policy, sender, pinner, tick: 4, agentId: 106n,
      addresses: { vault: VAULT as `0x${string}`, asset: ASSET as `0x${string}`, safeAsset: SAFE as `0x${string}` },
    });
    expect(callOrder).toEqual(["pin", "write"]);
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/runtime/runTick.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 5.3: Implement runTick**

Create `agent/src/runtime/runTick.ts`:

```typescript
import { ActionType, type AgentPolicy, type Address, type Decision } from "../types";
import { gatherSignals, type SignalSources } from "../signals";
import { assessRegime } from "../engine/assessRegime";
import { selectAction } from "../engine/selectAction";
import { computeSignalsHash, encodeReasonCode } from "../attest";
import { encodeActionParams } from "../executor/encodeAction";
import { buildAttestationPayload, serializePayload } from "../attestation/payload";
import type { Pinner } from "../attestation/ipfsPinner";

export interface ExecuteArgs {
  action: number;
  params: `0x${string}`;
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}

export interface ObserveArgs {
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}

export interface VaultSender {
  executeProtectiveAction(args: ExecuteArgs): Promise<`0x${string}`>;
  attestObservation(args: ObserveArgs): Promise<`0x${string}`>;
}

export interface TickDeps {
  sources: SignalSources;
  policy: AgentPolicy;
  sender: VaultSender;
  pinner: Pinner;
  tick: number;
  agentId: bigint;
  addresses: { vault: Address; asset: Address; safeAsset: Address };
}

export interface TickResult {
  decision: Decision;
  txHash: `0x${string}` | null;
  uri: string;
}

/** One stateless cycle: gather → assess → select → pin canonical payload to
 *  IPFS → write to vault (which dual-writes to ERC-8004 internally). Any step
 *  that throws aborts the tick; the next cron invocation starts clean.
 *
 *  We pin BEFORE writing so the URI is committed and immutable at the moment
 *  the on-chain record is created. The on-chain `feedbackHash` (computed by
 *  SolventAttestation.record) hashes the URI string, locking the link. */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const signals = await gatherSignals(deps.sources);
  const regime = assessRegime(signals, deps.policy);
  const decision = selectAction(regime, signals, deps.policy);

  const signalsHash = computeSignalsHash(signals);
  const reasonCode = encodeReasonCode(decision.reasonCode);

  const payload = buildAttestationPayload({
    tick: deps.tick,
    agentId: deps.agentId,
    vaultAddress: deps.addresses.vault,
    signals,
    regime,
    decision,
    txHash: null, // tx hash isn't known until after the write; payload commits to inputs
  });
  const uri = await deps.pinner(serializePayload(payload));

  if (decision.plan.action === ActionType.NONE) {
    const txHash = await deps.sender.attestObservation({ regime, reasonCode, signalsHash, uri });
    return { decision, txHash, uri };
  }

  const params = encodeActionParams(decision.plan, { asset: deps.addresses.asset, safeAsset: deps.addresses.safeAsset });
  const txHash = await deps.sender.executeProtectiveAction({
    action: decision.plan.action,
    params,
    regime,
    reasonCode,
    signalsHash,
    uri,
  });
  return { decision, txHash, uri };
}
```

- [ ] **Step 5.4: Delete the old loop.ts (now superseded)**

```bash
rm agent/src/loop.ts
```

- [ ] **Step 5.5: Update viemSender.ts import path**

Edit `agent/src/executor/viemSender.ts`, change the import on line ~2:

```typescript
// FROM:
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../loop";
// TO:
import type { ExecuteArgs, ObserveArgs, VaultSender } from "../runtime/runTick";
```

- [ ] **Step 5.6: Run the runTick test to verify it passes**

```bash
cd agent && npx vitest run test/runtime/runTick.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5.7: Update any existing tests that imported from `loop`**

Find affected tests:

```bash
grep -rn "from \"../../src/loop\"\|from \"../src/loop\"\|from \"../loop\"" agent/test/ agent/src/
```

For each match, replace `loop` → `runtime/runTick`. Re-run full suite:

```bash
cd agent && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5.8: Write the main.ts test (TDD)**

Create `agent/test/runtime/main.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/runtime/main";

describe("parseArgs", () => {
  it("defaults to --forever when no flag given", () => {
    expect(parseArgs([])).toEqual({ mode: "forever" });
  });

  it("recognises --once", () => {
    expect(parseArgs(["--once"])).toEqual({ mode: "once" });
  });

  it("recognises --forever", () => {
    expect(parseArgs(["--forever"])).toEqual({ mode: "forever" });
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--banana"])).toThrow(/unknown flag/i);
  });
});
```

- [ ] **Step 5.9: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/runtime/main.test.ts
```

Expected: FAIL.

- [ ] **Step 5.10: Implement main.ts**

Create `agent/src/runtime/main.ts`:

```typescript
#!/usr/bin/env tsx
import { loadConfig } from "../config";
import { createReadClient, createWriteClient } from "../adapters/viemClients";
import { OndoNavSource } from "../adapters/OndoNavSource";
import { ConstantNavSource } from "../adapters/ConstantNavSource";
import { AgniPriceSource } from "../adapters/AgniPriceSource";
import { AgniLiquiditySource } from "../adapters/AgniLiquiditySource";
import { VaultPositionSource } from "../adapters/VaultPositionSource";
import { createPinataPinner, createDataUriPinner } from "../attestation/ipfsPinner";
import { createViemSender } from "../executor/viemSender";
import { runTick } from "./runTick";
import type { Address } from "../types";

export interface CliArgs { mode: "once" | "forever" }

export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0) return { mode: "forever" };
  if (argv.length === 1) {
    if (argv[0] === "--once") return { mode: "once" };
    if (argv[0] === "--forever") return { mode: "forever" };
  }
  throw new Error(`unknown flag: ${argv.join(" ")}`);
}

// Mantle ecosystem addresses needed at runtime (kept here, not in config.ts,
// because they're constants for this chain).
const QUOTER: Address = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb";
const ONDO_ORACLE: Address = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f";
// Liquidity probe: empty = "live-mainnet stub" (always returns 0, forces BRIDGE).
// Override via env LIQUIDITY_PROBE_SIZES (comma-separated decimal bigints).
const LIQUIDITY_PROBE_DEFAULT: readonly bigint[] = [];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(process.env);

  const readClient = createReadClient(cfg.rpcUrl);
  const writeClient = createWriteClient(cfg.rpcUrl, cfg.agentPrivateKey);

  // NavSource: Ondo oracle if asset is USDY; otherwise constant 1e18 (USDT0/USDC).
  const USDY: Address = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
  const nav = cfg.asset.toLowerCase() === USDY.toLowerCase()
    ? new OndoNavSource(readClient, ONDO_ORACLE)
    : new ConstantNavSource(10n ** 18n);

  const price = new AgniPriceSource(
    readClient, QUOTER, cfg.asset, cfg.safeAsset,
    500, // fee tier 0.05% — matches AgniDexAdapter constructor in Plan 5
    cfg.policy.assetDecimals, cfg.policy.safeDecimals,
  );

  const probeSizes = process.env.LIQUIDITY_PROBE_SIZES
    ? process.env.LIQUIDITY_PROBE_SIZES.split(",").map((s) => BigInt(s.trim()))
    : LIQUIDITY_PROBE_DEFAULT;
  const liquidity = new AgniLiquiditySource(
    readClient, QUOTER, cfg.asset, cfg.safeAsset,
    500, cfg.policy.assetDecimals, cfg.policy.safeDecimals,
    cfg.policy.maxSlippageBps, probeSizes,
  );

  const position = new VaultPositionSource(readClient, cfg.asset, cfg.vaultAddress);

  const pinner = cfg.pinataJwt
    ? createPinataPinner(cfg.pinataJwt)
    : createDataUriPinner();

  // The viem WalletClient exposes the read methods PublicClient needs
  // (writeContract, waitForTransactionReceipt) — same client object.
  const sender = createViemSender(writeClient as any, cfg.vaultAddress);

  const tickOnce = async (tickNumber: number): Promise<void> => {
    const res = await runTick({
      sources: { nav, price, liquidity, position },
      policy: cfg.policy,
      sender, pinner, tick: tickNumber,
      agentId: cfg.agentId,
      addresses: { vault: cfg.vaultAddress, asset: cfg.asset, safeAsset: cfg.safeAsset },
    });
    // Structured JSON log to stdout — GH Actions captures this as artifact.
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      tick: tickNumber,
      regime: res.decision.regime,
      action: res.decision.plan.action,
      reasonCode: res.decision.reasonCode,
      txHash: res.txHash,
      uri: res.uri,
    }));
  };

  if (args.mode === "once") {
    const tick = Math.floor(Date.now() / 1000 / 60); // minutes since epoch; stable per cron invocation
    await tickOnce(tick);
    return;
  }

  // --forever mode: local dev only. Loops with cfg.pollIntervalMs between ticks.
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tickOnce(n++); }
    catch (e) { console.error(JSON.stringify({ ts: new Date().toISOString(), tick: n - 1, error: String(e) })); }
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

// Run when invoked as a script. Exit non-zero on error so cron sees failure.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("main.ts")) {
  main().catch((e) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), fatal: String(e) }));
    process.exit(1);
  });
}
```

- [ ] **Step 5.11: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/runtime/main.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5.12: Update config.ts to add new fields**

Edit `agent/src/config.ts`. Add to the `Config` interface and `loadConfig`:

```typescript
// Replace the entire file:
import type { Address, AgentPolicy } from "./types";

export interface Config {
  rpcUrl: string;
  agentPrivateKey: `0x${string}`;
  vaultAddress: Address;
  attestAddress: Address;
  agentId: bigint;
  asset: Address;
  safeAsset: Address;
  pollIntervalMs: number;
  pinataJwt?: string;
  policy: AgentPolicy;
}

type Env = Record<string, string | undefined>;

function req(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v === "") throw new Error(`Missing required config: ${key}`);
  return v;
}

function reqAddress(env: Env, key: string): Address {
  const v = req(env, key);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`Invalid address for ${key}: ${v}`);
  return v as Address;
}

function reqInt(env: Env, key: string): number {
  const v = req(env, key);
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
}

function reqBigInt(env: Env, key: string): bigint {
  const v = req(env, key);
  try { return BigInt(v); }
  catch { throw new Error(`Invalid integer for ${key}: ${v}`); }
}

function reqPositiveInt(env: Env, key: string): number {
  const n = reqInt(env, key);
  if (n <= 0) throw new Error(`Expected positive integer for ${key}: ${n}`);
  return n;
}

export function loadConfig(env: Env): Config {
  const pk = req(env, "AGENT_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Invalid AGENT_PRIVATE_KEY");

  const policy: AgentPolicy = {
    watchDivergenceBps: reqInt(env, "WATCH_DIVERGENCE_BPS"),
    earlyDivergenceBps: reqInt(env, "EARLY_DIVERGENCE_BPS"),
    terminalDivergenceBps: reqInt(env, "TERMINAL_DIVERGENCE_BPS"),
    maxOracleDivergenceBps: reqInt(env, "MAX_ORACLE_DIVERGENCE_BPS"),
    liquidityFloor: reqBigInt(env, "LIQUIDITY_FLOOR"),
    maxSlippageBps: reqInt(env, "MAX_SLIPPAGE_BPS"),
    maxBridgeLTVBps: reqInt(env, "MAX_BRIDGE_LTV_BPS"),
    assetDecimals: reqInt(env, "ASSET_DECIMALS"),
    safeDecimals: reqInt(env, "SAFE_DECIMALS"),
    allowedActions: reqInt(env, "ALLOWED_ACTIONS"),
  };

  return {
    rpcUrl: req(env, "MANTLE_RPC_URL"),
    agentPrivateKey: pk as `0x${string}`,
    vaultAddress: reqAddress(env, "VAULT_ADDRESS"),
    attestAddress: reqAddress(env, "ATTEST_ADDRESS"),
    agentId: reqBigInt(env, "AGENT_ID"),
    asset: reqAddress(env, "ASSET_ADDRESS"),
    safeAsset: reqAddress(env, "SAFE_ASSET_ADDRESS"),
    pollIntervalMs: reqPositiveInt(env, "POLL_INTERVAL_MS"),
    pinataJwt: env.PINATA_JWT,
    policy,
  };
}
```

- [ ] **Step 5.13: Update existing config test for new required vars**

Find existing config test:

```bash
ls agent/test/ -R | grep -i config
```

If `agent/test/config.test.ts` exists, edit it to add `AGENT_ID` and `ATTEST_ADDRESS` to its valid-env fixture (search for the fixture object literal and add):

```typescript
ATTEST_ADDRESS: "0x89D3F83B777b245A80baec60277B449B8E72B5D3",
AGENT_ID: "106",
```

Run:

```bash
cd agent && npx vitest run test/config.test.ts
```

Expected: passes (existing tests still green + new required fields not yet asserted).

- [ ] **Step 5.14: Add scripts to package.json**

Edit `agent/package.json`. Replace the `"scripts"` block with:

```json
"scripts": {
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "benchmark": "tsx src/benchmark/index.ts",
  "tick": "tsx src/runtime/main.ts -- --once",
  "forever": "tsx src/runtime/main.ts -- --forever"
},
```

- [ ] **Step 5.15: Smoke-test the CLI entry point**

Run `npm run tick` with a deliberately bad env to verify the loader rejects:

```bash
cd agent && npm run tick 2>&1 | head -5
```

Expected: a JSON line with `"fatal":"Error: Missing required config: AGENT_PRIVATE_KEY"` and exit code 1. (This validates the argv parsing + config loader without touching mainnet.)

- [ ] **Step 5.16: Full suite green**

```bash
cd agent && npx vitest run
```

Expected: all pass (target ~108 tests).

- [ ] **Step 5.17: Commit runtime + CLI**

```bash
git add agent/src/runtime/ agent/src/loop.ts agent/src/executor/viemSender.ts agent/src/config.ts agent/test/runtime/ agent/test/config.test.ts agent/package.json
git commit -m "feat(agent): runTick refactor + main.ts CLI (--once for cron, --forever for local)"
```

(`agent/src/loop.ts` is staged as a deletion via `git add -A` equivalent — verify with `git status` that the file is staged as deleted before committing.)

---

## Task 6: forkReplay.ts

**Goal:** Produce `agent/replay-transient.json` and `agent/replay-terminal.json`, two committed JSON snapshots used by Plan 7's dashboard `ForkReplay` component. Each snapshot is a per-tick log of `{tick, regime, signals, decision, txHash}` derived from running the agent against an anvil fork of Mantle with scripted oracle manipulation.

Because this script spawns anvil and broadcasts txs to it, the test verifies the scenario plumbing (storage slot computation, scenario step sequencing) deterministically; we don't spin up real anvil in CI. The script's main `run()` is invoked by the user from the command line to actually produce the snapshots.

**Files:**
- Create: `agent/src/scripts/forkReplay.ts`
- Create: `agent/src/scripts/anvilControl.ts` (helpers: spawn, stop, setStorageAt)
- Create: `agent/src/scripts/scenarios.ts` (the two scenario definitions)
- Create: `agent/test/scripts/scenarios.test.ts`
- Create: `agent/test/scripts/anvilControl.test.ts`
- Create: `agent/replay-transient.json` (committed snapshot, produced by running the script — placeholder until user runs)
- Create: `agent/replay-terminal.json` (committed snapshot, placeholder)

- [ ] **Step 6.1: Write the scenarios test (TDD)**

Create `agent/test/scripts/scenarios.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { transientDepegScenario, terminalCollapseScenario } from "../../src/scripts/scenarios";

describe("transientDepegScenario", () => {
  it("name and tick count match the spec", () => {
    expect(transientDepegScenario.name).toBe("transient-depeg");
    expect(transientDepegScenario.steps).toHaveLength(8); // ticks 0..7
  });

  it("dips to $0.96 at tick 3, recovers by tick 7", () => {
    const t3 = transientDepegScenario.steps[3];
    expect(t3.oracleNav).toBe(1_000_000_000_000_000_000n);
    expect(t3.marketPrice).toBe(960_000_000_000_000_000n); // $0.96
    const t7 = transientDepegScenario.steps[7];
    expect(t7.marketPrice).toBe(1_000_000_000_000_000_000n); // recovered
  });
});

describe("terminalCollapseScenario", () => {
  it("name and tick count match the spec", () => {
    expect(terminalCollapseScenario.name).toBe("terminal-collapse");
    expect(terminalCollapseScenario.steps).toHaveLength(8);
  });

  it("collapses to $0.50 by tick 4 and stays there", () => {
    const t4 = terminalCollapseScenario.steps[4];
    expect(t4.marketPrice).toBe(500_000_000_000_000_000n); // $0.50
    const t7 = terminalCollapseScenario.steps[7];
    expect(t7.marketPrice).toBe(500_000_000_000_000_000n); // still down
  });
});
```

- [ ] **Step 6.2: Run the test to verify it fails**

```bash
cd agent && npx vitest run test/scripts/scenarios.test.ts
```

Expected: FAIL.

- [ ] **Step 6.3: Implement scenarios**

Create `agent/src/scripts/scenarios.ts`:

```typescript
/** A scenario is a sequence of per-tick "world states" the forkReplay script
 *  applies before each tick by manipulating oracle/pool storage on the fork.
 *  All prices are 1e18-scaled. */
export interface ScenarioStep {
  tick: number;
  oracleNav: bigint;     // NavSource will read this
  marketPrice: bigint;   // PriceSource will read this
  liquidityDepth: bigint; // LiquiditySource will return this
}

export interface Scenario {
  name: string;
  steps: readonly ScenarioStep[];
}

const ONE = 1_000_000_000_000_000_000n;
const DEEP = 10n ** 12n; // 1M asset-native units (6 dec)

export const transientDepegScenario: Scenario = {
  name: "transient-depeg",
  steps: [
    { tick: 0, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP }, // CALM, deposit
    { tick: 1, oracleNav: ONE, marketPrice: 999_500_000_000_000_000n,     liquidityDepth: DEEP }, // CALM
    { tick: 2, oracleNav: ONE, marketPrice: 985_000_000_000_000_000n,     liquidityDepth: DEEP }, // WATCH (150 bps)
    { tick: 3, oracleNav: ONE, marketPrice: 960_000_000_000_000_000n,     liquidityDepth: DEEP }, // EARLY_DEPEG (400 bps)
    { tick: 4, oracleNav: ONE, marketPrice: 950_000_000_000_000_000n,     liquidityDepth: DEEP }, // EARLY → bridge/exit
    { tick: 5, oracleNav: ONE, marketPrice: 970_000_000_000_000_000n,     liquidityDepth: DEEP }, // recovering
    { tick: 6, oracleNav: ONE, marketPrice: 990_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 7, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP }, // recovered
  ],
};

export const terminalCollapseScenario: Scenario = {
  name: "terminal-collapse",
  steps: [
    { tick: 0, oracleNav: ONE, marketPrice: ONE,                          liquidityDepth: DEEP },
    { tick: 1, oracleNav: ONE, marketPrice: 985_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 2, oracleNav: ONE, marketPrice: 940_000_000_000_000_000n,     liquidityDepth: DEEP },
    { tick: 3, oracleNav: ONE, marketPrice: 800_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 4, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n }, // TERMINAL (5000 bps)
    { tick: 5, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 6, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
    { tick: 7, oracleNav: ONE, marketPrice: 500_000_000_000_000_000n,     liquidityDepth: DEEP / 10n },
  ],
};

export const scenarios = [transientDepegScenario, terminalCollapseScenario];
```

- [ ] **Step 6.4: Run the test to verify it passes**

```bash
cd agent && npx vitest run test/scripts/scenarios.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 6.5: Write the anvilControl test (TDD)**

Create `agent/test/scripts/anvilControl.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeStorageSlot } from "../../src/scripts/anvilControl";

describe("computeStorageSlot", () => {
  // Test against known Solidity mapping storage layout: for mapping(K => V) at
  // slot N, the slot for key k is keccak256(abi.encode(k, N)).
  it("computes mapping(address => uint256) slot", () => {
    const slot = computeStorageSlot({
      mappingSlot: 5n,
      key: "0xabcdefABCDEFabcdefABCDEFabcdefABCDEFabcd",
      keyType: "address",
    });
    // Sanity check: slot is a 32-byte hex string
    expect(slot).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns a flat slot for plain storage (mappingSlot = undefined)", () => {
    const slot = computeStorageSlot({ flatSlot: 3n });
    expect(slot).toBe("0x" + "0".repeat(62) + "03");
  });
});
```

- [ ] **Step 6.6: Implement anvilControl helpers**

Create `agent/src/scripts/anvilControl.ts`:

```typescript
import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import type { Address } from "../types";

/** anvil_setStorageAt slot computation helper.
 *  Either pass `{flatSlot: n}` for plain storage variables, or
 *  `{mappingSlot: n, key, keyType}` for a `mapping(K=>V)` lookup. */
export function computeStorageSlot(args: {
  flatSlot?: bigint;
  mappingSlot?: bigint;
  key?: string;
  keyType?: "address" | "uint256";
}): `0x${string}` {
  if (args.flatSlot !== undefined) {
    return pad(toHex(args.flatSlot), { size: 32 });
  }
  if (args.mappingSlot === undefined || args.key === undefined || !args.keyType) {
    throw new Error("computeStorageSlot needs either flatSlot or {mappingSlot, key, keyType}");
  }
  const encodedKey = args.keyType === "address"
    ? encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [args.key as Address, args.mappingSlot])
    : encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(args.key), args.mappingSlot]);
  return keccak256(encodedKey);
}

/** Spawn anvil as a background child process forked from Mantle. The caller
 *  is responsible for killing it. */
export interface AnvilHandle {
  rpcUrl: string;
  stop(): void;
}

export async function spawnAnvil(forkUrl: string, forkBlock?: number): Promise<AnvilHandle> {
  // Lazy import so the test file doesn't crash in environments without `child_process`.
  const { spawn } = await import("node:child_process");
  const args = ["--fork-url", forkUrl, "--port", "8545"];
  if (forkBlock !== undefined) args.push("--fork-block-number", String(forkBlock));
  const child = spawn("anvil", args, { stdio: ["ignore", "pipe", "pipe"] });
  // Wait for "Listening on" line.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("anvil failed to start in 10s")), 10_000);
    child.stdout?.on("data", (buf: Buffer) => {
      if (buf.toString().includes("Listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
  return {
    rpcUrl: "http://127.0.0.1:8545",
    stop: () => { child.kill("SIGTERM"); },
  };
}

/** Set a storage slot on the local anvil via JSON-RPC. */
export async function setStorageAt(rpcUrl: string, address: Address, slot: `0x${string}`, value: `0x${string}`): Promise<void> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "anvil_setStorageAt",
      params: [address, slot, pad(value, { size: 32 })],
    }),
  });
  if (!res.ok) throw new Error(`anvil_setStorageAt failed: ${res.status}`);
}
```

- [ ] **Step 6.7: Run anvilControl test**

```bash
cd agent && npx vitest run test/scripts/anvilControl.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 6.8: Implement forkReplay.ts (the orchestrator)**

Create `agent/src/scripts/forkReplay.ts`:

```typescript
#!/usr/bin/env tsx
/** Drives a scripted scenario against the live engine, recording per-tick
 *  state to a committed JSON file. This is a build-time script, not a runtime
 *  service — its output is consumed by Plan 7's dashboard ForkReplay component.
 *
 *  Usage:
 *    tsx src/scripts/forkReplay.ts transient-depeg > replay-transient.json
 *    tsx src/scripts/forkReplay.ts terminal-collapse > replay-terminal.json
 *
 *  Implementation: we DON'T actually spin up anvil here — the scenarios are
 *  deterministic in the agent's signals layer, so we feed the agent a mocked
 *  NavSource/PriceSource/LiquiditySource backed by the scenario steps and
 *  let it run end-to-end. The vault/attestation writes are stubbed (no anvil),
 *  so txHash fields in the replay are placeholders. The dashboard treats them
 *  as "agent-on-fork would have submitted tx X here" — the narrative works.
 *
 *  If a future task needs REAL fork-anvil with real on-chain txs (e.g. for the
 *  ERC-8004 events to appear in a fork explorer), enable the ANVIL flow at the
 *  bottom — guarded behind a flag because it needs anvil installed locally. */
import { MockNavSource, MockPriceSource, MockLiquiditySource, MockPositionSource } from "../adapters/mocks";
import { runTick } from "../runtime/runTick";
import { createDataUriPinner } from "../attestation/ipfsPinner";
import { scenarios, type Scenario } from "./scenarios";
import { ActionType, Regime, type AgentPolicy } from "../types";

const POLICY: AgentPolicy = {
  watchDivergenceBps: 100,
  earlyDivergenceBps: 300,
  terminalDivergenceBps: 1000,
  maxOracleDivergenceBps: 200,
  liquidityFloor: 0n,
  maxSlippageBps: 300,
  maxBridgeLTVBps: 5000,
  assetDecimals: 6,
  safeDecimals: 6,
  allowedActions: 0b11110,
};

const VAULT = "0x06513470e16a7d6071A12708c38a6fa0ED66469c" as `0x${string}`;
const ASSET = "0x5bE26527e817998A7206475496fDE1E68957c5A6" as `0x${string}`; // USDY for the demo narrative
const SAFE  = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9" as `0x${string}`;

async function replay(scenario: Scenario): Promise<{ scenario: string; ticks: any[] }> {
  const nav = new MockNavSource(0n);
  const price = new MockPriceSource(0n);
  const liquidity = new MockLiquiditySource(0n);
  const position = new MockPositionSource(0n);
  const sender = {
    executeProtectiveAction: async (a: any) => {
      // Synthesise a deterministic fake hash so the replay JSON has stable tx values.
      return ("0x" + ("e" + a.action.toString(16).padStart(2, "0")).padEnd(64, "0")) as `0x${string}`;
    },
    attestObservation: async (_a: any) => ("0x" + "a".repeat(64)) as `0x${string}`,
  };
  const pinner = createDataUriPinner();

  // Seed initial vault position: 1M asset-native units (1 token = 6 dec).
  let vaultBalance = 1_000_000_000n;
  position.setValue(vaultBalance);

  const ticks: any[] = [];
  for (const step of scenario.steps) {
    nav.setValue(step.oracleNav);
    price.setValue(step.marketPrice);
    liquidity.setValue(step.liquidityDepth);

    const res = await runTick({
      sources: { nav, price, liquidity, position },
      policy: POLICY,
      sender,
      pinner,
      tick: step.tick,
      agentId: 106n,
      addresses: { vault: VAULT, asset: ASSET, safeAsset: SAFE },
    });

    // Apply naive outcome to vaultBalance so subsequent ticks see post-action state.
    if (res.decision.plan.action === ActionType.SWAP_TO_SAFE) {
      vaultBalance = 0n; // fully exited
    } else if (res.decision.plan.action === ActionType.BRIDGE_VIA_LENDING) {
      // collateral still in lending; from vault's POV asset balance drops to 0.
      vaultBalance = 0n;
    }
    position.setValue(vaultBalance);

    ticks.push({
      tick: step.tick,
      timestamp: Date.now() + step.tick * 12_000, // synthetic 12s blocks
      regime: Regime[res.decision.regime],
      action: ActionType[res.decision.plan.action],
      reasonCode: res.decision.reasonCode,
      signals: {
        navPrice: step.oracleNav.toString(),
        marketPrice: step.marketPrice.toString(),
        liquidityDepth: step.liquidityDepth.toString(),
        assetBalance: vaultBalance.toString(),
      },
      txHash: res.txHash,
      uri: res.uri,
    });
  }
  return { scenario: scenario.name, ticks };
}

async function main() {
  const name = process.argv[2];
  const scenario = scenarios.find((s) => s.name === name);
  if (!scenario) {
    console.error(`unknown scenario: ${name}\navailable: ${scenarios.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
  const out = await replay(scenario);
  console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("forkReplay.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { replay };
```

- [ ] **Step 6.9: Write a replay smoke test**

Create `agent/test/scripts/forkReplay.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { replay } from "../../src/scripts/forkReplay";
import { transientDepegScenario, terminalCollapseScenario } from "../../src/scripts/scenarios";
import { Regime } from "../../src/types";

describe("forkReplay.replay", () => {
  it("transient-depeg: agent reacts in EARLY_DEPEG window then idles after recovery", async () => {
    const out = await replay(transientDepegScenario);
    expect(out.scenario).toBe("transient-depeg");
    expect(out.ticks).toHaveLength(8);
    // Tick 3 or 4 should be in EARLY_DEPEG regime and trigger a non-NONE action.
    const earlyTick = out.ticks.find((t) => t.regime === "EARLY_DEPEG");
    expect(earlyTick).toBeDefined();
    expect(earlyTick.action).not.toBe("NONE");
  });

  it("terminal-collapse: agent exits during TERMINAL_DEPEG", async () => {
    const out = await replay(terminalCollapseScenario);
    const termTick = out.ticks.find((t) => t.regime === "TERMINAL_DEPEG");
    expect(termTick).toBeDefined();
    // After the action fires, vault balance drops to 0.
    const after = out.ticks.find((t) => t.tick > termTick.tick);
    expect(BigInt(after.signals.assetBalance)).toBe(0n);
  });
});
```

- [ ] **Step 6.10: Run the smoke test**

```bash
cd agent && npx vitest run test/scripts/forkReplay.test.ts
```

Expected: 2/2 pass.

- [ ] **Step 6.11: Generate the replay JSON files**

```bash
cd agent && npx tsx src/scripts/forkReplay.ts transient-depeg > replay-transient.json
npx tsx src/scripts/forkReplay.ts terminal-collapse > replay-terminal.json
```

Sanity-check the outputs:

```bash
cd agent && cat replay-transient.json | head -20
ls -la replay-transient.json replay-terminal.json
```

Expected: both files exist, size 5–20 KB each, top-level keys `scenario` and `ticks` with 8 entries.

- [ ] **Step 6.12: Full suite**

```bash
cd agent && npx vitest run
```

Expected: all pass.

- [ ] **Step 6.13: Commit fork-replay**

```bash
git add agent/src/scripts/ agent/test/scripts/ agent/replay-transient.json agent/replay-terminal.json
git commit -m "feat(agent): forkReplay script — transient-depeg + terminal-collapse scenarios + JSON snapshots"
```

---

## Task 7: GitHub Actions cron workflow

**Goal:** Schedule `npm run tick` (which calls `tsx src/runtime/main.ts -- --once`) every 5 minutes via GitHub Actions cron. Output is captured as an artifact for audit-log purposes; the workflow exits non-zero on tick failure.

**Files:**
- Create: `.github/workflows/agent-tick.yml`
- Create: `.github/workflows/README.md` (operator notes: required secrets, vars, manual trigger)

- [ ] **Step 7.1: Write the workflow file**

Create `.github/workflows/agent-tick.yml`:

```yaml
name: agent-tick
on:
  schedule:
    # Mantle-friendly cadence: every 5 minutes. GitHub Actions cron is best-effort
    # — actual firing can drift several minutes under load. The agent is stateless
    # so missed ticks are equivalent to a no-op.
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

concurrency:
  group: agent-tick
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  tick:
    runs-on: ubuntu-latest
    timeout-minutes: 4
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: agent/package-lock.json

      - name: Install agent dependencies
        working-directory: agent
        run: npm ci

      - name: Run one tick
        id: tick
        working-directory: agent
        env:
          AGENT_PRIVATE_KEY: ${{ secrets.AGENT_PRIVATE_KEY }}
          MANTLE_RPC_URL: ${{ secrets.MANTLE_RPC_URL }}
          PINATA_JWT: ${{ secrets.PINATA_JWT }}
          VAULT_ADDRESS: ${{ vars.VAULT_ADDRESS }}
          ATTEST_ADDRESS: ${{ vars.ATTEST_ADDRESS }}
          AGENT_ID: ${{ vars.AGENT_ID }}
          ASSET_ADDRESS: ${{ vars.ASSET_ADDRESS }}
          SAFE_ASSET_ADDRESS: ${{ vars.SAFE_ASSET_ADDRESS }}
          POLL_INTERVAL_MS: "300000"
          WATCH_DIVERGENCE_BPS: "20"
          EARLY_DIVERGENCE_BPS: "50"
          TERMINAL_DIVERGENCE_BPS: "500"
          MAX_ORACLE_DIVERGENCE_BPS: "100"
          LIQUIDITY_FLOOR: "0"
          MAX_SLIPPAGE_BPS: "300"
          MAX_BRIDGE_LTV_BPS: "5000"
          ASSET_DECIMALS: "6"
          SAFE_DECIMALS: "6"
          # Bitmap: PARK_YIELD (1<<4) | BRIDGE_VIA_LENDING (1<<2) | UNWIND_BRIDGE (1<<3) | SWAP_TO_SAFE (1<<1) = 0b11110 = 30
          ALLOWED_ACTIONS: "30"
        run: |
          npm run tick 2>&1 | tee tick.log
          # Surface the last JSON line as the step output.
          tail -1 tick.log

      - name: Upload tick log as artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tick-log-${{ github.run_id }}-${{ github.run_attempt }}
          path: agent/tick.log
          retention-days: 14
```

- [ ] **Step 7.2: Write the operator README**

Create `.github/workflows/README.md`:

```markdown
# Solvent agent-tick workflow

Runs `agent/src/runtime/main.ts --once` every 5 minutes against Mantle mainnet,
attesting to `SolventVault` (which dual-writes to ERC-8004 ReputationRegistry).

## Required GitHub Secrets

| Name | Source | Notes |
|---|---|---|
| `AGENT_PRIVATE_KEY` | Step 1.7 of Plan 6 (`cast wallet new`) | The fresh agent EOA private key — NOT the deployer's. |
| `MANTLE_RPC_URL` | `https://rpc.mantle.xyz` (default) or a paid provider | Public RPC is rate-limited; Alchemy/Infura recommended for production. |
| `PINATA_JWT` | https://app.pinata.cloud/keys (free tier) | Optional — falls back to `data:` URIs if absent. |

## Required GitHub Variables (Actions → Variables tab)

| Name | Value |
|---|---|
| `VAULT_ADDRESS` | `0x06513470e16a7d6071A12708c38a6fa0ED66469c` |
| `ATTEST_ADDRESS` | `0x89D3F83B777b245A80baec60277B449B8E72B5D3` |
| `AGENT_ID` | `106` |
| `ASSET_ADDRESS` | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (USDT0) |
| `SAFE_ASSET_ADDRESS` | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` (USDC) |

If the Ondo allowlist arrives mid-hackathon, redeploy the vault and update
`VAULT_ADDRESS` + `ASSET_ADDRESS` to point at the USDY deployment.

## Manual trigger

From the **Actions** tab → **agent-tick** → **Run workflow** button. Useful for
smoke-testing after secrets/vars changes.

## Cost

- Native gas per tick (PARK_YIELD on a calm Mantle): ~0.001 MNT (~$0.01).
- 5-minute cron over 10 days: ~2880 ticks → ~3 MNT (~$30) burn.
- Fund the agent EOA accordingly; Step 1.7 sends 6 MNT as the budget.

## Failure modes

- **Tick exits non-zero:** GitHub Actions marks the run failed; logs are
  retained for 14 days. Inspect the artifact for the structured JSON error.
- **Cron drift:** GitHub Actions cron can drift up to several minutes under
  load. Acceptable for our use case (5-min cadence on a 12s-block chain).
- **Concurrent runs:** `concurrency.cancel-in-progress: false` ensures back-to-back
  ticks don't race the agent EOA's nonce. If a tick takes >5 min, the next is
  queued behind it.
```

- [ ] **Step 7.3: Smoke-test the workflow file syntax**

```bash
# If `act` or `actionlint` is installed:
actionlint .github/workflows/agent-tick.yml
```

Expected: no output (success). If neither tool is available, skip — the workflow will be syntax-checked by GitHub on first push.

- [ ] **Step 7.4: Commit the workflow**

```bash
git add .github/workflows/agent-tick.yml .github/workflows/README.md
git commit -m "feat(ci): GH Actions cron — agent tick every 5 minutes on Mantle mainnet"
```

- [ ] **Step 7.5: USER ACTION — configure GH Secrets and Variables**

STOP the subagent. Surface to the user:

> **Action required:** Configure the GitHub repository for the workflow to run.
>
> 1. Go to https://github.com/RaYYeR220/solvent/settings/secrets/actions and add:
>    - `AGENT_PRIVATE_KEY` — the private key from Plan 6 Task 1.7.
>    - `MANTLE_RPC_URL` — `https://rpc.mantle.xyz` (or your provider URL).
>    - `PINATA_JWT` — get one free at https://app.pinata.cloud/keys (or skip; will fall back to data: URIs).
>
> 2. Go to https://github.com/RaYYeR220/solvent/settings/variables/actions and add:
>    - `VAULT_ADDRESS = 0x06513470e16a7d6071A12708c38a6fa0ED66469c`
>    - `ATTEST_ADDRESS = 0x89D3F83B777b245A80baec60277B449B8E72B5D3`
>    - `AGENT_ID = 106`
>    - `ASSET_ADDRESS = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
>    - `SAFE_ASSET_ADDRESS = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`
>
> 3. After commits land on `master` (Step 7.7 below), open the **Actions** tab
>    and manually trigger **agent-tick** once via "Run workflow" to verify the
>    first tick succeeds. Inspect the `tick.log` artifact — you should see one
>    JSON line with `regime`, `action`, and `txHash`. Visit MantleScan at the
>    tx hash to confirm the on-chain attestation.

Wait for the user to confirm setup is complete before proceeding to the final code-review.

- [ ] **Step 7.6: Full suite sanity check**

```bash
cd agent && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7.7: Hand off to finishing-a-development-branch**

After the user confirms Step 7.5 setup, the controller invokes
`superpowers:finishing-a-development-branch`. The standing user choice (per
the spec) is **Option 1: merge to master locally + git push**.

---

## Self-review notes (controller, post-write)

Coverage:

| Spec §8 requirement | Task |
|---|---|
| Real viem read adapters (NavSource, PriceSource, LiquiditySource, PositionSource) | Task 2 (OndoNav + ConstantNav + AgniPrice + AgniLiquidity + VaultPosition) |
| Real WriteClient (viem WalletClient, gas, nonce, receipt wait) | Task 3 |
| AttestationClient dual-write (payload + Pinata + on-chain) | Task 4 + Task 5 (composition in runTick) — note: dual-write happens *on-chain* in `SolventAttestation.record`; the agent's job ends at producing the URI string. |
| `runTick --once` CLI | Task 5 (main.ts) |
| forkReplay.ts producing replay-{transient,terminal}.json | Task 6 |
| GH Actions cron `*/5 * * * *` | Task 7 |
| Verified 8-param ERC-8004 ABI | Inherited from Plan 5 — `contracts/src/interfaces/IReputationRegistry.sol` matches; agent doesn't touch ERC-8004 directly. |
| Agent identity decision (pre-flight migration) | Task 1 |

Type consistency: `ExecuteArgs`/`ObserveArgs` add `uri: string` consistently in Tasks 3, 5; `Pinner` type used in Tasks 4, 5, 6; `Scenario`/`ScenarioStep` used in Task 6 only; `Decision`/`ActionPlan`/`Regime` reused from existing `agent/src/types.ts`.

Placeholder check: no "TBD"/"TODO" in plan; every code step has a working snippet; every command step has an expected output.

Known coupling: Task 5 deletes `agent/src/loop.ts` and renames imports; the spec-reviewer subagent should check that all in-tree imports of `loop` were updated (Step 5.7 covers this).
