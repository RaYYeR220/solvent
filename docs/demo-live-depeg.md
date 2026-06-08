# Live Depeg Demo — Runbook

A recordable demo on a **forked Mantle**: the Solvent agent reacts to a USDY
depeg by swapping the vault out of USDY into the safe asset (USDC). Live mainnet
is never touched — everything runs against a local anvil fork.

> Phase 1 = the guaranteed **swap** scenario (no INIT, no contract changes; uses
> the existing `SolventVaultV2`). Bridge scenario is layered on in later phases.

## Addresses (Mantle)

```
USDY              0x5bE26527e817998A7206475496fDE1E68957c5A6  (18 dec)
USDC              0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9  (6 dec)
AGNI_SWAP_ROUTER  0x319B69888b0d11cEC22caA5034e25FfFBDc88421
AGNI_QUOTER_V2    0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
USDY/USDC f100    0x9cd55b03c64B65Ba02A1D985Caef63046B2d54eb   (thin ~$1k pool)
ATTESTATION       0x89D3F83B777b245A80baec60277B449B8E72B5D3
AGENT_EOA         0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c   (agentId 106)
```

Anvil default account 0 (deployer / depositor):
```
addr  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
key   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## 1. Start the fork

```bash
export PATH="$HOME/.foundry/bin:$PATH"
anvil --fork-url https://rpc.mantle.xyz --chain-id 5000 --port 8545
```

Leave it running in its own terminal. All commands below use
`--rpc-url http://localhost:8545`.

## 2. Deploy the vault + Agni adapter (SetupDemoFork)

> **Run step 3 (fund USDY) FIRST, then this step.** With acct 0 pre-funded, the
> script deposits 100 USDY in-broadcast (prints `DEPOSITED`). If you skip funding,
> the deposit is skipped (`SKIP_DEPOSIT_DEPOSITOR_UNDERFUNDED`) and you'd have to
> deposit manually afterwards. `deal()` is a `Test` cheatcode and does not persist
> on a `--broadcast` against a running anvil, which is why we write USDY storage
> directly in step 3.

```bash
cd contracts
DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
DEMO_DEPOSIT=100000000000000000000 \
forge script script/SetupDemoFork.s.sol --rpc-url http://localhost:8545 \
  --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Prints the deployed **VAULT** and **ADAPTER** addresses. Copy the VAULT address
— it goes into the agent env and (later) the dashboard env.

> **IMPORTANT — do the funding (step 3) BEFORE this step.** `SetupDemoFork`
> deposits in-broadcast only if the depositor is already funded, and the vault's
> CREATE address is deterministic **only if the deployer's nonce is still at the
> setup tx** (funding via `anvil_setStorageAt` does NOT bump the nonce, so it's
> safe to fund first). On a clean fork with funding-first, the printed addresses
> are stable: **VAULT `0x398E4948e373Db819606A459456176D31C3B1F91`**, ADAPTER
> `0xFCFE742e19790Dd67a627875ef8b45F17DB1DaC6`. (If you run any swap from acct0
> before setup, the nonce moves and the vault address changes — just re-read it
> from the script output.)

## 3. Fund USDY on the fork — `anvil_setStorageAt` (the verified method)

USDY (`0x5bE2…c5A6`) is an EIP-1967 proxy; its `balances` mapping lives at
**base slot 201** of the implementation's storage (delegatecall runs in the
proxy's storage). We brute-forced this by tracing a `balanceOf` call
(`debug_traceCall`) and reverse-matching the SLOAD key
`keccak256(abi.encode(holder, slot))` — slot **201** matches. `deal()` does not
work here (forge-std `Test` cheatcode; doesn't persist on a `--broadcast`
against a live anvil), so we write storage directly.

Fund acct 0 with **10 000 USDY** — enough for the 100-USDY deposit AND the
depeg swap later:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
RPC=http://localhost:8545
USDY=0x5bE26527e817998A7206475496fDE1E68957c5A6
ACCT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266     # anvil acct 0

# balances mapping base slot = 201 (verified via balanceOf trace)
KEY=$(cast index address $ACCT 201)
cast rpc anvil_setStorageAt $USDY $KEY $(cast to-uint256 10000000000000000000000) --rpc-url $RPC

# verify
cast call $USDY 'balanceOf(address)(uint256)' $ACCT --rpc-url $RPC   # => 10000e18
```

> **Fallback (whale impersonation)** — works for ≤ ~359 USDY (the Agni USDY/USDT
> pool `0xe38E3a…` holds ~359). Insufficient for the depeg swap, so prefer the
> `setStorageAt` method above:
> ```bash
> WHALE=0xe38E3a804eF845e36F277D86Fb2b24b8C32B3340
> cast rpc anvil_impersonateAccount $WHALE --rpc-url $RPC
> cast rpc anvil_setBalance $WHALE 0xde0b6b3a7640000 --rpc-url $RPC
> cast send $USDY 'transfer(address,uint256)' $ACCT 100000000000000000000 --from $WHALE --unlocked --rpc-url $RPC
> cast rpc anvil_stopImpersonatingAccount $WHALE --rpc-url $RPC
> ```

After funding, run **step 2** (`SetupDemoFork`). Because acct 0 now holds USDY,
the script deposits 100 USDY in-broadcast and prints `DEPOSITED …`.

## 4. Verify the bootstrap + point the agent's key at the vault

```bash
VAULT=0x398E4948e373Db819606A459456176D31C3B1F91   # from step 2 output
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # anvil acct 0

cast call $VAULT 'totalAssets()(uint256)' --rpc-url $RPC            # => 100e18
cast call $USDY  'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC  # => 100e18

# The vault's agent is the real AGENT_EOA (0x8D8B…). The demo agent signs with
# anvil acct 0, so repoint the vault's agent to acct 0 (acct 0 is the owner on
# the fork). Without this, executeProtectiveAction reverts NotAgent.
cast send $VAULT 'setAgent(address)' $ACCT --private-key $KEY --rpc-url $RPC
cast call $VAULT 'agent()(address)' --rpc-url $RPC                  # => 0xf39F…2266
```

## 5. Swap scenario — CALM → depeg → SWAP_TO_SAFE (verified end-to-end)

This is the full Phase-1 deliverable, verified on the fork at block ~96.39M.

### Why the thresholds are what they are (read this)

On this fork the **thin USDY/USDC f100 pool is structurally pinned at ~1.05 USDC
per USDY** with deep two-sided liquidity right at that tick, while the Ondo NAV
oracle reports USDY ≈ **1.1355** (USDY accrues yield). So the agent sees a
**standing ~720 bps divergence** even with no manual depeg — that's the real
state of the pool, not an artifact.

Crucially, **all of the pool's liquidity sits at/above ~1.05**; there is none
below it. A swap that pushes the price meaningfully lower falls off a liquidity
cliff (price → ~0, divergence → 9999 bps) and **destroys the exit liquidity the
SWAP needs** — so a catastrophic crash makes the agent correctly refuse
(`protect-failed-illiquid`: never dump into an empty pool). The usable demo
window is therefore a **small** depeg that nudges divergence from ~720 to ~780 bps
while liquidity stays intact.

We pick demo thresholds around that window: **WATCH=730, EARLY=735,
TERMINAL=750.** Baseline 720 < 730 ⇒ CALM; a 500-USDY depeg pushes it to ~779 ⇒
TERMINAL, with the deep band still able to absorb the 100-USDY exit.

### Configure the agent

```bash
cd agent
cp .env.fork.example .env.fork
# edit .env.fork: set VAULT_ADDRESS=0x398E4948e373Db819606A459456176D31C3B1F91
#                 (MANTLE_RPC_URL=http://localhost:8545, ALLOWED_ACTIONS=2 already set)
```

`main.ts` loads env via `dotenv/config`; point it at `.env.fork` with
`DOTENV_CONFIG_PATH`. The three demo thresholds are passed inline (they override
the file) so the structural ~720 bps reads CALM until the depeg:

### 5a. Agent run #1 — BEFORE the depeg (expect CALM)

```bash
cd agent
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=750 \
  npx tsx src/runtime/main.ts --once
```

Expected (JSON line): `"regime":0` (CALM), `"action":0` (NONE),
`reasonCode":"calm-idle"`. The agent pins an attestation and calls
`attestObservation` (a real tx). Decoded signals: market ≈ 1.0537, nav ≈ 1.1355,
divergence ≈ 720 bps, liquidityDepth = 1000e18, assetBalance = 100e18.

### 5b. Trigger the depeg (500-USDY swap, liquidity preserved)

```bash
# re-fund acct 0 USDY for the swap (setStorageAt does not bump nonce)
cast rpc anvil_setStorageAt $USDY $(cast index address $ACCT 201) \
  $(cast to-uint256 10000000000000000000000) --rpc-url $RPC

cd contracts
MODE=terminal AMOUNT=500000000000000000000 DEPLOYER_ADDRESS=$ACCT \
forge script script/ManualDepegFork.s.sol --rpc-url $RPC \
  --broadcast --unlocked --sender $ACCT
# prints amountIn 500e18, amountOut ~524.9 USDC

# confirm the pool moved (marginal 1-USDY quote drops ~1.0537 -> ~1.0469):
QUOTER=0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb
cast call $QUOTER \
  'quoteExactInputSingle((address,address,uint256,uint24,uint160))(uint256,uint160,uint32,uint256)' \
  "($USDY,$USDC,1000000000000000000,100,0)" --rpc-url $RPC   # => ~1046922  (div ~779 bps)
```

> Do **not** use a large `AMOUNT` (e.g. 2000e18): it drains the pool, divergence
> jumps to 9999 bps, exit liquidity → 0, and the agent will (correctly) report
> `protect-failed-illiquid` instead of swapping. 500e18 is the validated size.

### 5c. Agent run #2 — AFTER the depeg (expect SWAP_TO_SAFE)

```bash
cd agent
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=750 \
  npx tsx src/runtime/main.ts --once
```

Expected: `"regime":3` (TERMINAL_DEPEG), `"action":1` (SWAP_TO_SAFE),
`reasonCode":"terminal-exit"`, decision `{amountIn:100e18, amountOutMin:97e6}`,
and a non-null `txHash` — a successful `executeProtectiveAction`.

### 5d. Verify the protective swap landed

```bash
USDC=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
cast call $USDY 'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC   # => 0
cast call $USDC 'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC   # => ~103534587 (103.53 USDC)
cast call $VAULT 'totalAssets()(uint256)' --rpc-url $RPC              # => ~103.53e18 (value preserved)
```

The vault has fully exited USDY into the safe asset: **USDY 100 → 0, USDC 0 →
~103.53, totalAssets preserved.** That is the swap scenario, end-to-end on a
fork, with no mainnet transaction anywhere.

### Recorded-demo loop (optional)

For a live screen recording, run the agent in `--forever` mode (polls every
`POLL_INTERVAL_MS`) and fire the depeg in another terminal mid-loop:

```bash
cd agent
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=750 \
  npx tsx src/runtime/main.ts --forever
# ... watch CALM ticks, then run step 5b in another shell; the next tick swaps.
```
