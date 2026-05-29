# Ondo USDY Allowlist Request — Solvent

## Filed
- Date: 2026-05-29 (Day 1 of Plan 5)
- Contact: compliance@ondo.finance (and/or Ondo Discord #partner-integrations)
- Requested vault address: 0x06513470e16a7d6071A12708c38a6fa0ED66469c
- Vault on MantleScan: https://mantlescan.xyz/address/0x06513470e16a7d6071A12708c38a6fa0ED66469c
- Repository: https://github.com/RaYYeR220/solvent
- Vault constructor wiring (verified contract):
  - asset: USDT0 — `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (will swap to USDY post-allowlist)
  - owner / agent: `0x3A3Bf4a0dFa88a040693F9718cEd65dA23f40798`
  - agentId: 106 (ERC-8004 Identity NFT, minted on IdentityRegistry `0x8004A169FB4a3325136EB29fA0CEb6d2E539a432`)
  - attestation: `0x89D3F83B777b245A80baec60277B449B8E72B5D3` (mirrors to ERC-8004 ReputationRegistry)
  - bridge venue: InitLendingAdapter `0x783bC82FE4AFB635De351EEB0D09542D3B09C847` → INIT USDY pool
  - DEX router: AgniDexAdapter `0x24090d62792930Aa34351B8b19850581D48628f9` → Agni V3
  - policy: earlyTrig 0.5% / termTrig 5% / maxSlippage 3% / maxBridgeLTV 50%

## Status
- Pending (filed 2026-05-29)

## If approved
Re-run Deploy.s.sol with `RISK_ASSET=0x5bE26527e817998A7206475496fDE1E68957c5A6` (USDY).
Mainnet deploy currently uses USDT0 as risk asset (permissionless).
