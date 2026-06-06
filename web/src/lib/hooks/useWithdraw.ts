"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { CONTRACTS, vaultAbi } from "../contracts";

export type WithdrawState = "idle" | "redeeming" | "done" | "error";

export interface WithdrawLive {
  state: WithdrawState;
  canWithdraw: boolean;
  txHash: string | undefined;
  error: string | undefined;
  /** Standard ERC-4626 redeem — burns shares, returns the risk asset.
   *  Reverts on-chain if the vault doesn't hold enough risk asset. */
  redeem: (shares: bigint, receiver: `0x${string}`, owner: `0x${string}`) => Promise<void>;
  /** Non-standard fallback — burns shares, returns pro-rata mix of risk + safe asset.
   *  Used when the vault is in safe mode. */
  redeemAll: (shares: bigint, receiver: `0x${string}`) => Promise<void>;
}

export function useWithdraw(): WithdrawLive {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<WithdrawState>("idle");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const { writeContractAsync } = useWriteContract();

  const run = useCallback(async (
    fn: "redeem" | "redeemAll",
    args: readonly unknown[],
  ) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    setState("redeeming");
    try {
      const tx = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: vaultAbi,
        functionName: fn,
        args,
      });
      setTxHash(tx);
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, writeContractAsync]);

  const redeem = useCallback(
    (shares: bigint, receiver: `0x${string}`, owner: `0x${string}`) =>
      run("redeem", [shares, receiver, owner]),
    [run],
  );

  const redeemAll = useCallback(
    (shares: bigint, receiver: `0x${string}`) =>
      run("redeemAll", [shares, receiver]),
    [run],
  );

  return {
    state,
    canWithdraw: isConnected && !!address,
    txHash,
    error,
    redeem,
    redeemAll,
  };
}
