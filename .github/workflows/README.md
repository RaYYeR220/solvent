# Solvent agent-tick workflow

Runs `agent/src/runtime/main.ts --once` every 5 minutes against Mantle mainnet,
attesting to `SolventVault` (which dual-writes to ERC-8004 ReputationRegistry).

## Required GitHub Secrets

Configure at https://github.com/RaYYeR220/solvent/settings/secrets/actions

| Name | Source | Notes |
|---|---|---|
| `AGENT_PRIVATE_KEY` | Plan 6 Task 1.7 (`cast wallet new`) | The fresh agent EOA private key — NOT the deployer's. EOA `0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c` is funded with 6 MNT. |
| `MANTLE_RPC_URL` | `https://rpc.mantle.xyz` (default) or a paid provider | Public RPC is rate-limited; Alchemy/Infura recommended for production. |
| `PINATA_JWT` | https://app.pinata.cloud/keys (free tier) | Optional — falls back to `data:` URIs if absent. |

## Required GitHub Variables (Actions → Variables tab)

Configure at https://github.com/RaYYeR220/solvent/settings/variables/actions

| Name | Value |
|---|---|
| `VAULT_ADDRESS` | `0x06513470e16a7d6071A12708c38a6fa0ED66469c` |
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
- Fund the agent EOA accordingly; Plan 6 Task 1.8 sent 6 MNT as the budget.

## Failure modes

- **Tick exits non-zero:** GitHub Actions marks the run failed; logs are
  retained for 14 days. Inspect the artifact for the structured JSON error.
- **Cron drift:** GitHub Actions cron can drift up to several minutes under
  load. Acceptable for our use case (5-min cadence on a 12s-block chain).
- **Concurrent runs:** `concurrency.cancel-in-progress: false` ensures back-to-back
  ticks don't race the agent EOA's nonce. If a tick takes >5 min, the next is
  queued behind it.
