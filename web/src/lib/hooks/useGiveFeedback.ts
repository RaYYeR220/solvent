"use client";

import { useCallback, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { keccak256, stringToBytes } from "viem";
import { CONTRACTS, reputationRegistryAbi } from "../contracts";

export type FeedbackState = "idle" | "submitting" | "done" | "error";

/** The agent's ERC-8004 identity owner. The ReputationRegistry rejects
 *  self-feedback (`tx.origin` owning the agentId reverts with
 *  "Self-feedback not allowed"), so this wallet can't rate; everyone else can. */
export const AGENT_OWNER = "0x8D8BB77189a95eFF0D45EB08A75e35DcA8a1432c";

export interface GiveFeedbackLive {
  state: FeedbackState;
  canRate: boolean; // connected AND not the agent owner
  isOwner: boolean; // connected wallet === agent identity owner (can't self-rate)
  txHash: string | undefined;
  error: string | undefined;
  rate: (stars: number, comment: string) => Promise<void>;
}

export function useGiveFeedback(): GiveFeedbackLive {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<FeedbackState>("idle");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const { writeContractAsync } = useWriteContract();

  const isOwner =
    isConnected && address?.toLowerCase() === AGENT_OWNER.toLowerCase();
  const canRate = isConnected && !!address && !isOwner;

  const rate = useCallback(
    async (stars: number, comment: string) => {
      if (!isConnected || !address) {
        setState("error");
        setError("wallet not connected");
        return;
      }
      if (isOwner) {
        setState("error");
        setError("agents can't rate themselves");
        return;
      }
      setError(undefined);
      setState("submitting");
      try {
        const payload = {
          stars,
          comment,
          vault: CONTRACTS.vault,
          ts: Math.floor(Date.now() / 1000),
        };
        const json = JSON.stringify(payload);
        const feedbackURI = "data:application/json," + encodeURIComponent(json);
        const feedbackHash = keccak256(stringToBytes(json));
        const args = [
          CONTRACTS.agentId,
          BigInt(stars),
          0,
          "depeg-protection",
          "",
          "",
          feedbackURI,
          feedbackHash,
        ] as const;
        const tx = await writeContractAsync({
          address: CONTRACTS.reputationRegistry,
          abi: reputationRegistryAbi,
          functionName: "giveFeedback",
          args,
        });
        setTxHash(tx);
        setState("done");
      } catch (e) {
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [isConnected, address, isOwner, writeContractAsync],
  );

  return {
    state,
    canRate,
    isOwner,
    txHash,
    error,
    rate,
  };
}
