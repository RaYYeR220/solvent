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

```bash
cd contracts
DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
forge script script/SetupDemoFork.s.sol --rpc-url http://localhost:8545 \
  --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Prints the deployed **VAULT** and **ADAPTER** addresses. Copy the VAULT address
— it goes into the agent env and (later) the dashboard env.

> The script's in-broadcast `deposit` is **skipped** when the depositor has no
> USDY (it logs `SKIP_DEPOSIT_DEPOSITOR_UNDERFUNDED`). `deal()` is a `Test`
> cheatcode and does not persist on a broadcast against a running anvil, so we
> fund USDY out-of-band (step 3) and deposit (step 4) as real txs.

## 3. Fund USDY on the fork (whale impersonation — the method that works)

USDY is an EIP-1967 proxy with non-trivial balance storage, so `anvil_setStorageAt`
on a guessed slot is unreliable. Instead, impersonate a known USDY holder and
`transfer`. The Agni USDY/USDT pool holds ~359 USDY — plenty for a 100-USDY demo.

```bash
export PATH="$HOME/.foundry/bin:$PATH"
USDY=0x5bE26527e817998A7206475496fDE1E68957c5A6
RPC=http://localhost:8545
WHALE=0xe38E3a804eF845e36F277D86Fb2b24b8C32B3340   # Agni USDY/USDT pool, ~359 USDY
ACCT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266     # anvil acct 0 (depositor)

cast rpc anvil_impersonateAccount $WHALE --rpc-url $RPC
cast rpc anvil_setBalance $WHALE 0xde0b6b3a7640000 --rpc-url $RPC   # 1 ETH for gas
cast send $USDY 'transfer(address,uint256)' $ACCT 100000000000000000000 \
  --from $WHALE --unlocked --rpc-url $RPC
cast rpc anvil_stopImpersonatingAccount $WHALE --rpc-url $RPC

# verify
cast call $USDY 'balanceOf(address)(uint256)' $ACCT --rpc-url $RPC   # => 100e18
```

## 4. Deposit 100 USDY into the vault

```bash
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
VAULT=<paste from step 2>
AMT=100000000000000000000

cast send $USDY 'approve(address,uint256)' $VAULT $AMT --private-key $KEY --rpc-url $RPC
cast send $VAULT 'deposit(uint256,address)' $AMT $ACCT --private-key $KEY --rpc-url $RPC

# verify
cast call $VAULT 'totalAssets()(uint256)' --rpc-url $RPC          # => 100e18
cast call $USDY  'balanceOf(address)(uint256)' $VAULT --rpc-url $RPC  # => 100e18
```

Vault is now bootstrapped: holds 100 USDY, `totalAssets() == 100e18`.

<!-- Phase 1 swap scenario (agent CALM -> depeg -> SWAP_TO_SAFE) appended in Task 1.5. -->
