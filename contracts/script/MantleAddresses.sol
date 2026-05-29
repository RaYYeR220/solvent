// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Single source of truth for Mantle mainnet external contract addresses.
/// Verified against MantleScan / official protocol docs on 2026-05-29.
/// See docs/superpowers/specs/2026-05-29-solvent-integration-design.md §6.
library MantleAddresses {
    // ---- Risk assets ----
    address internal constant USDY = 0x5bE26527e817998A7206475496fDE1E68957c5A6;
    address internal constant MUSD = 0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3;
    address internal constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address internal constant USDT = 0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE;
    address internal constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9;
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;

    // ---- Oracles ----
    address internal constant ONDO_RWA_DYNAMIC_ORACLE = 0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f;

    // ---- DEX (Agni Finance, Uniswap V3 fork) ----
    address internal constant AGNI_SWAP_ROUTER = 0x319B69888b0d11cEC22caA5034e25FfFBDc88421;
    address internal constant AGNI_QUOTER_V2 = 0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb;
    address internal constant AGNI_FACTORY = 0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035;
    address internal constant AGNI_USDY_USDT_POOL = 0xe38E3a804eF845e36F277D86Fb2b24b8C32B3340;

    // ---- Lending (INIT Capital) ----
    address internal constant INIT_CORE = 0x972BcB0284cca0152527c4f70f8F689852bCAFc5;
    address internal constant INIT_POS_MANAGER = 0x0e7401707CD08c03CDb53DAEF3295DDFb68BBa92;
    address internal constant INIT_CONFIG = 0x007F91636E0f986068Ef27c950FA18734BA553Ac;
    address internal constant INIT_ORACLE = 0x4E195A32b2f6eBa9c4565bA49bef34F23c2C0350;
    address internal constant INIT_LENS = 0x7d2b278b8ef87bEb83AeC01243ff2Fed57456042;
    address internal constant INIT_USDY_POOL = 0xf084813F1be067d980a0171F067f084f27B3F63A;
    address internal constant INIT_USDC_POOL = 0x00A55649E597d463fD212fBE48a3B40f0E227d06;
    address internal constant INIT_USDT_POOL = 0xadA66a8722B5cdfe3bC504007A5d793e7100ad09;

    // ---- ERC-8004 (deployed by Mantle Feb 2026) ----
    address internal constant ERC8004_IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address internal constant ERC8004_REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    // ---- Chain ----
    uint256 internal constant CHAIN_ID = 5000;
}
