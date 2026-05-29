"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { CONTRACTS, erc20Abi, vaultAbi } from "../contracts";

export type DepositState =
  | "idle"
  | "approving"
  | "approve-confirmed"
  | "depositing"
  | "done"
  | "error";

export interface DepositLive {
  state: DepositState;
  canDeposit: boolean;
  approveTxHash: string | undefined;
  depositTxHash: string | undefined;
  error: string | undefined;
  /** Invoke the full approve-then-deposit flow with the given amount in
   *  asset-native units (e.g. BigInt(100_000_000) for 100 USDT0 at 6 dec). */
  deposit: (amount: bigint) => Promise<void>;
}

export function useDeposit(): DepositLive {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<DepositState>("idle");
  const [approveTxHash, setApproveTxHash] = useState<string>();
  const [depositTxHash, setDepositTxHash] = useState<string>();
  const [error, setError] = useState<string>();

  const allowanceRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.vault] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const deposit = useCallback(async (amount: bigint) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    try {
      const currentAllowance = (allowanceRead.data as bigint | undefined) ?? BigInt(0);
      if (currentAllowance < amount) {
        setState("approving");
        const txApprove = await writeContractAsync({
          address: CONTRACTS.asset,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.vault, amount],
        });
        setApproveTxHash(txApprove);
        setState("approve-confirmed");
        await allowanceRead.refetch();
      }
      setState("depositing");
      const txDeposit = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount],
      });
      setDepositTxHash(txDeposit);
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, allowanceRead, writeContractAsync]);

  return {
    state,
    canDeposit: isConnected && !!address,
    approveTxHash,
    depositTxHash,
    error,
    deposit,
  };
}
