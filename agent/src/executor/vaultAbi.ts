/** Minimal ABI fragment of SolventVault the agent calls. Enums encode as uint8. */
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
    ],
    outputs: [],
  },
] as const;
