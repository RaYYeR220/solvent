# Live Depeg Demo — Runbook

A recordable demo on a **forked Mantle**: the Solvent agent reacts to a USDY
depeg in one of two ways, driven by its real swap-vs-bridge logic —
- **SWAP** the vault out of USDY into the safe asset (USDC) when the pool is
  deep enough to exit cleanly (small balance ≤ pool depth), or
- **BRIDGE** (hedge via INIT lending) when a swap can't clear (large balance >
  pool depth) and the depeg is transient (EARLY), then **UNWIND** on the re-peg.

Live mainnet is never touched — everything runs against a local anvil fork.

> `SetupDemoFork` deploys `SolventVaultV2_1` (INIT-aware `totalAssets()`) +
> `InitLendingAdapterV2` (USDY→USDC bridge) with a swap|bridge|unwind policy
> (`allowedActions=14`). `DEMO_DEPOSIT` selects the scenario at depeg time:
> **SMALL (≤ pool depth, e.g. 100 USDY) ⇒ swap; LARGE (> pool depth, e.g. 5000
> USDY) ⇒ bridge.** The swap scenario (§5) and the bridge scenario (§6) are both
> verified end-to-end on the fork below.

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

## 2. Deploy the vault + adapters (SetupDemoFork)

`SetupDemoFork` deploys `SolventVaultV2_1` + the Agni swap **ADAPTER** + the INIT
**BRIDGE** adapter, and wires the swap|bridge|unwind policy. This step is shared
by BOTH scenarios; only `DEMO_DEPOSIT` differs (100 USDY for swap §5, 5000 USDY
for bridge §6).

> **Run step 3 (fund USDY) FIRST, then this step.** With acct 0 pre-funded, the
> script deposits `DEMO_DEPOSIT` USDY in-broadcast (prints `DEPOSITED`). If you
> skip funding, the deposit is skipped (`SKIP_DEPOSIT_DEPOSITOR_UNDERFUNDED`) and
> you'd deposit manually afterwards. `deal()` is a `Test` cheatcode and does not
> persist on a `--broadcast` against a running anvil, which is why we write USDY
> storage directly in step 3.

```bash
cd contracts
DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
DEMO_DEPOSIT=100000000000000000000 \
forge script script/SetupDemoFork.s.sol --rpc-url http://localhost:8545 \
  --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Prints the deployed **VAULT**, **ADAPTER** (swap), and **BRIDGE** (INIT) addresses.
On a clean fork (funding-first, no prior acct0 swaps) the addresses are
deterministic: **VAULT `0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167`**, ADAPTER
`0xFCFE742e19790Dd67a627875ef8b45F17DB1DaC6`, BRIDGE
`0x398E4948e373Db819606A459456176D31C3B1F91`. Copy the VAULT address — it goes
into the agent env and (later) the dashboard env.

> **IMPORTANT — do the funding (step 3) BEFORE this step.** `SetupDemoFork`
> deposits in-broadcast only if the depositor is already funded, and the vault's
> CREATE address is deterministic **only if the deployer's nonce is still at the
> setup tx** (funding via `anvil_setStorageAt` does NOT bump the nonce, so it's
> safe to fund first). On a clean fork with funding-first, the printed addresses
> are stable: **VAULT `0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167`**, ADAPTER
> (swap) `0xFCFE742e19790Dd67a627875ef8b45F17DB1DaC6`, BRIDGE (INIT)
> `0x398E4948e373Db819606A459456176D31C3B1F91`. (If you run any swap from acct0
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
VAULT=0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167   # from step 2 output
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # anvil acct 0

cast call $VAULT 'totalAssets()(uint256)' --rpc-url $RPC            # => 100e18
cast call $USDY  'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC  # => 100e18

# The vault's agent is the real AGENT_EOA (0x8D8B…). The demo agent signs with
# anvil acct 0, so repoint the vault's agent to acct 0 (acct 0 is the owner on
# the fork). Without this, executeProtectiveAction reverts NotAgent.
cast send $VAULT 'setAgent(address)' $ACCT --private-key $KEY --rpc-url $RPC
cast call $VAULT 'agent()(address)' --rpc-url $RPC                  # => 0xf39F…2266
```

## 4b. Dashboard (fork) — repoint the env + VAULT MODE indicator

The dashboard reads the same vault you just deployed. Point it at the **fork RPC**
and the **fork vault address** via `web/.env.local`, then run the dev server. This
is the same UI as production — only the env differs (the chain is Mantle id 5000,
which matches the fork's `--chain-id 5000`).

```bash
cd web
cat > .env.local <<EOF
NEXT_PUBLIC_MANTLE_RPC=http://localhost:8545
NEXT_PUBLIC_VAULT_ADDRESS=0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167
NEXT_PUBLIC_ASSET_ADDRESS=0x5bE26527e817998A7206475496fDE1E68957c5A6
NEXT_PUBLIC_SAFE_ASSET_ADDRESS=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
EOF
npm run dev    # http://localhost:3000/app
```

> Use the **VAULT address printed by SetupDemoFork** (step 2). `NEXT_PUBLIC_*`
> vars are baked at dev-server start, so set `.env.local` **before** `npm run
> dev` (restart the server if you change it). `ASSET`/`SAFE_ASSET` are USDY/USDC.

**VAULT MODE indicator.** Just under the protected-position strip, the dashboard
shows a `VAULT MODE` row driven by the live `useVaultMode` hook (reads
`policy.bridgeVenue` → the INIT adapter's `collateralUnderlying()` /
`debtUnderlying()`):

- **`VAULT MODE: DIRECT`** (cyan) — the vault holds its risk/safe asset directly;
  no open hedge. This is the state at deposit, after a **SWAP** (§5), and after an
  **UNWIND** (§6c). The line reads `holding risk asset directly`.
- **`VAULT MODE: BRIDGED`** (warm-gold) — the agent has hedged via INIT. The
  breakdown line shows `collateral <USDY> · borrowed <USDC>` (collateral 18-dec,
  debt 6-dec), e.g. `collateral 4,999.99 USDY · borrowed 2,500.00 USDC` after the
  bridge in §6b. It flips back to DIRECT on the unwind.

The panel polls every 12 s (wagmi `refetchInterval`), so after an agent action the
mode flips within a poll cycle — no reload needed. Drive the scenarios in §5/§6 and
watch the indicator (and TVL / decision log) react live.

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
# edit .env.fork: set VAULT_ADDRESS=0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167
#   (MANTLE_RPC_URL=http://localhost:8545 already set; ALLOWED_ACTIONS=14 — the
#    vault's on-chain policy is swap|bridge|unwind, and the swap path is a subset,
#    so 14 works for BOTH scenarios. The thresholds below are passed inline.)
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

> **Reliability note (use this if the forge script fails).** On a long-lived
> anvil the `forge script` broadcast can revert with a router deadline error
> (the `block.timestamp + 600` deadline is computed at the simulation block,
> which may lag the broadcast block). The robust alternative is a direct
> `cast send` to the Agni router with a fresh wall-clock deadline — used verbatim
> in the bridge scenario below (§6b). It's the same swap, just driven by `cast`:
> ```bash
> ROUTER=0x319B69888b0d11cEC22caA5034e25FfFBDc88421
> cast send $USDY 'approve(address,uint256)' $ROUTER 500000000000000000000 --private-key $KEY --rpc-url $RPC
> DL=$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")
> cast send $ROUTER \
>   'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))(uint256)' \
>   "($USDY,$USDC,100,$ACCT,$DL,500000000000000000000,0,0)" --private-key $KEY --rpc-url $RPC
> ```

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

---

## 6. Bridge scenario — CALM → EARLY depeg → BRIDGE_VIA_LENDING → re-peg → UNWIND_BRIDGE (verified end-to-end)

When the vault's risk balance **exceeds the pool's exit depth**, a swap can't
clear cleanly. On a **transient (EARLY)** depeg the agent instead **hedges**: it
moves the USDY into INIT Capital as collateral and borrows USDC out
(`BRIDGE_VIA_LENDING`). On the **re-peg** it closes the hedge (`UNWIND_BRIDGE`),
returning to USDY. The vault's `SolventVaultV2_1.totalAssets()` values the open
INIT position (collateral − debt) so the **share price is preserved across the
whole round-trip**.

### Why these exact numbers (read this)

- **Deposit 5000 USDY** ≫ the pool's ~1000-USDY exit depth, so the agent's
  full-exit swap is rejected (`liquidityDepth 1000 < assetBalance 5000`) and the
  EARLY-only bridge fallback fires.
- **Thresholds WATCH=730 / EARLY=735 / TERMINAL=900.** The pool's standing
  baseline divergence is ~720 bps (CALM). A small 500-USDY depeg pushes it to
  ~779 bps, which lands in **[735, 900) = EARLY** (not TERMINAL — TERMINAL never
  bridges). The high TERMINAL=900 keeps the small depeg inside the EARLY band.
- **maxBridgeLTVBps = 5000 (50%)**, safely under INIT's observed ~65% usable LTV
  on USDY collateral. So 5000 USDY collateral ⇒ 2500 USDC borrowed.
- **Agent env: `ALLOWED_ACTIONS=14`** (swap|bridge|unwind) — matches the vault's
  on-chain policy. The agent reads the open INIT position straight off the vault's
  `policy.bridgeVenue` adapter views (`collateralUnderlying()` / `debtUnderlying()`),
  so the unwind trigger needs no extra config.

### 6a. Fresh fork + INIT unpause + fund + deploy (5000 USDY)

INIT has **mint (INC#400) and mode-1 borrow (INC#402) operationally paused**
protocol-wide at this block (a transient guardian pause — pools hold $1.2M+
minted and USDY is whitelisted in mode 1). The bridge tx reverts unless we flip
those flags back on, mirroring INIT's normal unpaused state. (burn/repay are NOT
paused, so the **unwind** needs no unpause.) These are the `vm.store` cheats from
`contracts/test/InitFork.t.sol`, replayed via `anvil_setStorageAt`.

```bash
export PATH="$HOME/.foundry/bin:$PATH"
RPC=http://localhost:8545
CONFIG=0x007F91636E0f986068Ef27c950FA18734BA553Ac   # INIT InitConfig
INUSDY=0xf084813F1be067d980a0171F067f084f27B3F63A
INUSDC=0x00A55649E597d463fD212fBE48a3B40f0E227d06
USDY=0x5bE26527e817998A7206475496fDE1E68957c5A6
USDC=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
ACCT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# helpers: hex add (slot offset) and hex OR (set a bit)
addhex() { node -e "process.stdout.write('0x'+(BigInt('$1')+BigInt($2)).toString(16))"; }
orhex()  { node -e "process.stdout.write('0x'+(BigInt('$1')|BigInt('$2')).toString(16).padStart(64,'0'))"; }

# 1) UNPAUSE INIT mint (inUSDY + inUSDC) and mode-1 borrow.
#    PoolConfig.canMint: slot = keccak(abi.encode(pool,2)) + 1, byte0 := 1.
#    ModeStatus.canBorrow: slot = keccak(abi.encode(mode=1,3)) + 6, byte2 (bit16) := 1.
sU=$(addhex $(cast keccak $(cast abi-encode "f(address,uint256)" $INUSDY 2)) 1)
sC=$(addhex $(cast keccak $(cast abi-encode "f(address,uint256)" $INUSDC 2)) 1)
sM=$(addhex $(cast keccak $(cast abi-encode "f(uint256,uint256)" 1 3)) 6)
cast rpc anvil_setStorageAt $CONFIG $sU $(orhex $(cast storage $CONFIG $sU --rpc-url $RPC) 0x1)     --rpc-url $RPC
cast rpc anvil_setStorageAt $CONFIG $sC $(orhex $(cast storage $CONFIG $sC --rpc-url $RPC) 0x1)     --rpc-url $RPC
cast rpc anvil_setStorageAt $CONFIG $sM $(orhex $(cast storage $CONFIG $sM --rpc-url $RPC) 0x10000) --rpc-url $RPC

# 2) Fund acct0 USDY (balances mapping base slot = 201; setStorageAt does NOT bump nonce).
cast rpc anvil_setStorageAt $USDY $(cast index address $ACCT 201) \
  $(cast to-uint256 30000000000000000000000) --rpc-url $RPC

# 3) Deploy V2.1 + adapters with a LARGE 5000-USDY deposit (=> bridge path).
cd contracts
DEPLOYER_ADDRESS=$ACCT DEMO_DEPOSIT=5000000000000000000000 \
forge script script/SetupDemoFork.s.sol --rpc-url $RPC --broadcast --unlocked --sender $ACCT
# prints DEPOSITED 5000e18, VAULT 0xbe18…Ba167, ADAPTER 0xFCFE…DaC6, BRIDGE 0x398E…1F91

VAULT=0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167
BRIDGE=0x398E4948e373Db819606A459456176D31C3B1F91

# 4) Repoint the vault's agent to acct0 (the demo agent's key) — else NotAgent.
cast send $VAULT 'setAgent(address)' $ACCT --private-key $KEY --rpc-url $RPC
cast call $VAULT 'totalAssets()(uint256)' --rpc-url $RPC   # => 5000e18
```

Point the agent at this vault:
```bash
cd agent && cp .env.fork.example .env.fork
# edit .env.fork: VAULT_ADDRESS=0xbe18A1B61ceaF59aEB6A9bC81AB4FB87D56Ba167  (ALLOWED_ACTIONS=14 already set)
```

### 6b. Baseline → transient depeg → BRIDGE

```bash
# Agent run #1 — baseline (expect CALM). 720 bps < WATCH 730.
cd agent
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=900 \
  npx tsx src/runtime/main.ts --once
#   => "regime":0 (CALM), "action":0 (NONE), "reasonCode":"calm-idle"

# Transient depeg: 500 USDY -> USDC via a DIRECT cast send (reliable; see §5b note).
# Pushes the marginal quote ~1.0537 -> ~1.0469 => divergence ~779 bps (EARLY band).
ROUTER=0x319B69888b0d11cEC22caA5034e25FfFBDc88421
cast rpc anvil_setStorageAt $USDY $(cast index address $ACCT 201) \
  $(cast to-uint256 30000000000000000000000) --rpc-url $RPC      # re-fund acct0 USDY
cast send $USDY 'approve(address,uint256)' $ROUTER 500000000000000000000 --private-key $KEY --rpc-url $RPC
DL=$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")
cast send $ROUTER \
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))(uint256)' \
  "($USDY,$USDC,100,$ACCT,$DL,500000000000000000000,0,0)" --private-key $KEY --rpc-url $RPC

# Agent run #2 — after the depeg (expect BRIDGE_VIA_LENDING).
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=900 \
  npx tsx src/runtime/main.ts --once
#   => "regime":2 (EARLY_DEPEG), "action":2 (BRIDGE_VIA_LENDING),
#      "reasonCode":"liquidity-bridge", decision {collateralAmount:5000e18, borrowAmount:2500e6},
#      and a non-null txHash — a successful on-chain bridge.
```

Verify the hedge is open (USDY moved to INIT, USDC borrowed in, value preserved):
```bash
cast call $USDY   'balanceOf(address)(uint256)' $VAULT  --rpc-url $RPC   # => 0          (USDY -> INIT)
cast call $USDC   'balanceOf(address)(uint256)' $VAULT  --rpc-url $RPC   # => 2500000000 (2500 USDC borrowed)
cast call $BRIDGE 'collateralUnderlying()(uint256)'     --rpc-url $RPC   # => ~4999.99e18 (collateral)
cast call $BRIDGE 'debtUnderlying()(uint256)'           --rpc-url $RPC   # => ~2500.000001e6 (debt + accrual)
cast call $VAULT  'totalAssets()(uint256)'              --rpc-url $RPC   # => ~4999.99e18 (PRESERVED)
```

### 6c. Re-peg → UNWIND

```bash
# Seed a tiny USDC buffer into the vault so the full repay covers the
# interest-accrued debt (debt ~2500.000001 > the 2500.000000 borrowed). INIT
# rejects a full-collateral withdraw if any dust debt remains (INC#300), so the
# agent repays the vault's WHOLE safe balance (over-covers => clean close; the
# adapter refunds the unspent USDC). Vault USDC balance slot = 9.
cast rpc anvil_setStorageAt $USDC $(cast index address $VAULT 9) \
  $(cast to-uint256 2505000000) --rpc-url $RPC                  # 2500 borrowed + 5 buffer

# Re-peg: swap USDC -> USDY until divergence drops below WATCH (730 => CALM).
# The pool's liquidity is concentrated, so step in small increments and watch the
# quote; a single big swap overshoots. (Below: repeat until the marginal quote
# implies < 730 bps. In practice ~2000 USDC total brings it back to CALM.)
cast rpc anvil_setStorageAt $USDC $(cast index address $ACCT 9) \
  $(cast to-uint256 20000000000) --rpc-url $RPC                 # fund acct0 USDC
for amt in 1500 200 80 80 80 80; do
  DL=$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")
  cast send $USDC 'approve(address,uint256)' $ROUTER ${amt}000000 --private-key $KEY --rpc-url $RPC
  cast send $ROUTER \
    'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))(uint256)' \
    "($USDC,$USDY,100,$ACCT,$DL,${amt}000000,0,0)" --private-key $KEY --rpc-url $RPC
  q=$(cast call 0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb \
    'quoteExactInputSingle((address,address,uint256,uint24,uint160))(uint256,uint160,uint32,uint256)' \
    "($USDY,$USDC,1000000000000000000,100,0)" --rpc-url $RPC | head -1 | awk '{print $1}')
  div=$(node -e "const q=BigInt('$q');const nav=1135482350000000000n;const m=q*10n**12n;console.log(m>=nav?0:Number((nav-m)*10000n/nav))")
  echo "div=$div"; [ "$div" -lt 730 ] && break
done

# Agent run #3 — after the re-peg (expect UNWIND_BRIDGE).
cd agent
DOTENV_CONFIG_PATH=.env.fork \
WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=900 \
  npx tsx src/runtime/main.ts --once
#   => "regime":0 (CALM), "action":3 (UNWIND_BRIDGE), "reasonCode":"unwind-repeg",
#      decision {repayAmount:2505e6, withdrawAmount:~5000e18}, non-null txHash.
```

Verify the hedge is closed and the vault is back in USDY, value preserved:
```bash
cast call $BRIDGE 'collateralUnderlying()(uint256)'    --rpc-url $RPC   # => 0  (cleared)
cast call $BRIDGE 'debtUnderlying()(uint256)'          --rpc-url $RPC   # => 0  (cleared)
cast call $USDY   'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC   # => ~4999.99e18 (back to USDY)
cast call $USDC   'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC   # => ~5e6 leftover buffer dust
cast call $VAULT  'totalAssets()(uint256)'             --rpc-url $RPC   # => ~5005e18 (5000 + buffer, preserved)
```

**Round-trip proven:** 5000 USDY → (bridge) INIT collateral + 2500 USDC borrowed
→ (unwind) ~5000 USDY back, INIT position cleared, `totalAssets` preserved across
every step. The only real cost is INIT's borrow-interest dust on the closed loan.
No mainnet transaction anywhere.

> **On the unwind buffer.** The vault borrows exactly 2500 USDC but the debt
> accrues a hair above that, so a clean full close needs marginally more USDC than
> was borrowed. The fork integration test
> (`contracts/test/SolventVaultV2_1.fork.t.sol`) documents the same: it seeds a
> small USDC buffer before unwind. In production the vault would carry a small
> safe-asset reserve (or borrow slightly under the LTV cap) so the unwind always
> covers accrued interest; the agent already repays the vault's **whole** safe
> balance for exactly this reason.

---

## 7. Recording the demo

**Screen-recording is the user's** — this runbook produces the live, reacting
system; capturing it (OBS / QuickTime / Loom) is up to you. A clean take:

1. Start the fork (§1), unpause INIT + fund USDY (§3 / §6a).
2. Deploy with the scenario's `DEMO_DEPOSIT` (§2): **100 USDY** for the swap take,
   **5000 USDY** for the bridge take. `setAgent` to acct0 (§4).
3. Point the dashboard at the fork and open `http://localhost:3000/app` (§4b).
   It shows **VAULT MODE: DIRECT** at rest.
4. Start the agent in `--forever` so it polls live (it attests CALM ticks):
   ```bash
   cd agent
   DOTENV_CONFIG_PATH=.env.fork \
   WATCH_DIVERGENCE_BPS=730 EARLY_DIVERGENCE_BPS=735 TERMINAL_DIVERGENCE_BPS=750 \
     npx tsx src/runtime/main.ts --forever
   ```
   (Use `TERMINAL_DIVERGENCE_BPS=900` for the **bridge** take so the small depeg
   lands in the EARLY band — see §6.)
5. With the recording rolling, fire the depeg in another shell (§5b swap / §6b
   bridge). On the next poll the agent acts on-chain and the dashboard reacts:
   **TVL preserved**, a new **decision-log** entry, and the **VAULT MODE**
   indicator flips **DIRECT → BRIDGED** (bridge take only). For the bridge take,
   then run the re-peg (§6c) and watch it flip **BRIDGED → DIRECT** on unwind.

Everything runs against the local anvil fork; **no mainnet transaction is sent at
any point**, so the recording is safe to make repeatedly.
