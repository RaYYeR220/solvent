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
  /** Approve the vault to spend `amount` of the underlying asset.
   *  Step 1 of the two-step user flow. */
  approve: (amount: bigint) => Promise<void>;
  /** ERC-4626 `deposit(amount, receiver)` — assumes allowance is already
   *  sufficient (UI gates the button on the live allowance). Step 2 of
   *  the user flow. */
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

  const approve = useCallback(async (amount: bigint) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    try {
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
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, allowanceRead, writeContractAsync]);

  const deposit = useCallback(async (amount: bigint) => {
    if (!isConnected || !address) {
      setState("error");
      setError("wallet not connected");
      return;
    }
    setError(undefined);
    try {
      setState("depositing");
      const txDeposit = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount, address],
      });
      setDepositTxHash(txDeposit);
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isConnected, address, writeContractAsync]);

  return {
    state,
    canDeposit: isConnected && !!address,
    approveTxHash,
    depositTxHash,
    error,
    approve,
    deposit,
  };
}
