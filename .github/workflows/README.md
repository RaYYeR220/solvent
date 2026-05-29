# Solvent agent-tick workflow

Runs `agent/src/runtime/main.ts --once` on an hourly schedule against Mantle
mainnet, attesting to `SolventVault` (which dual-writes to ERC-8004
ReputationRegistry).

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

Per-tick (`attestObservation` + ERC-8004 mirror write):
- ~470k gas × 50 gwei ≈ **0.0235 MNT (~$0.015)** at MNT ~$0.65.

By cadence (rough daily burn out of agent EOA `0x8D8B...432c`):

| `cron` | Ticks/day | Burn/day | 6 MNT lasts |
|---|---|---|---|
| `*/5` (5 min) | 288 | ~$4.5 | <1 day |
| `*/15` (15 min) | 96 | ~$1.5 | ~4 days |
| `*/30` (30 min) | 48 | ~$0.75 | ~8 days |
| **`0 *` (hourly, default)** | **24** | **~$0.36** | **~16 days** |
| `0 */2` (2h) | 12 | ~$0.18 | ~33 days |

Plan 6 Task 1.8 sent 6 MNT to the agent EOA as the initial budget.

## Operating cookbook

**Dev / build phase (Plan 7):** keep the workflow **Disabled** between dev
sessions — zero burn. Use **Run workflow** (manual `workflow_dispatch`) for
ad-hoc smoke tests; that path is always available regardless of the
scheduled-cron state.

To disable: **Actions** tab → **agent-tick** → top-right "⋯" menu → **Disable
workflow**. Re-enable from the same menu.

**Pre-judging / demo day:** re-enable the workflow ~24–48h before judges look,
optionally bump cron to `*/15` for a denser attestation stream. Top up the
agent EOA with another 3–5 MNT if MNT balance < 2.

To bump cadence temporarily: edit `cron: "0 * * * *"` → `cron: "*/15 * * * *"`
in `.github/workflows/agent-tick.yml`, push to master. After demo day revert.

To check agent balance:
```
cast balance 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c --rpc-url https://rpc.mantle.xyz --ether
```

To refuel:
```
cast send 0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c --value 5ether \
  --rpc-url https://rpc.mantle.xyz --private-key $DEPLOYER_PRIVATE_KEY
```

## Failure modes

- **Tick exits non-zero:** GitHub Actions marks the run failed (we use
  `set -eo pipefail`); the `tick.log` artifact is uploaded regardless via
  `if: always()`. Inspect the JSON error in the artifact; the next scheduled
  cron starts clean.
- **Cron drift:** GitHub Actions cron can drift up to several minutes under
  load. Hourly cadence comfortably tolerates this.
- **Concurrent runs:** `concurrency.cancel-in-progress: false` ensures
  back-to-back ticks don't race the agent EOA's nonce. If a tick takes
  >timeout-minutes, the next is queued behind it.
