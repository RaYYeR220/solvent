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
