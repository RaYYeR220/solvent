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
