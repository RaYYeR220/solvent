/** Minimal ABI fragment of SolventVault the agent calls. Mirrors the on-chain
 *  ABI exported at contracts/exports/abis/SolventVaultV2.json. The two
 *  functions below — executeProtectiveAction and attestObservation — have
 *  identical signatures in V1 and V2, so this fragment is unchanged from V1;
 *  only the canonical reference moved to V2. */
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
