"use client";

import { useState } from "react";
import { useWatchContractEvent } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CONTRACTS, reputationRegistryAbi } from "../contracts";
import { fetchAttestationJson } from "../ipfs";
import type { Log } from "viem";

export interface DecisionEntry {
  blockNumber: bigint;
  txHash: string;
  uri: string;
  payload: {
    tick?: number;
    regime?: string;
    decision?: { action?: string; reasonCode?: string };
    signals?: Record<string, string>;
  } | undefined;
  payloadLoading: boolean;
}

export interface DecisionLogLive {
  entries: DecisionEntry[];
  attestationsTotal: number;
  isLoading: boolean;
}

const MAX_BUFFERED = 50;

export function useDecisionLog(): DecisionLogLive {
  const [events, setEvents] = useState<Array<{ blockNumber: bigint; txHash: string; uri: string }>>([]);

  useWatchContractEvent({
    address: CONTRACTS.reputationRegistry,
    abi: reputationRegistryAbi,
    eventName: "NewFeedback",
    args: { agentId: CONTRACTS.agentId },
    onLogs(logs: Log[]) {
      const decoded = logs.map((l: any) => ({
        blockNumber: l.blockNumber as bigint,
        txHash: l.transactionHash as string,
        uri: (l.args?.feedbackURI as string) ?? "",
      }));
      setEvents((prev) => {
        const merged = [...prev, ...decoded];
        const seen = new Set<string>();
        const out: typeof merged = [];
        for (const e of [...merged].reverse()) {
          if (seen.has(e.txHash)) continue;
          seen.add(e.txHash);
          out.push(e);
        }
        return out.reverse().slice(-MAX_BUFFERED);
      });
    },
    poll: true,
    pollingInterval: 12_000,
  });

  // Pad to fixed 5 slots so the 5 useQuery calls happen unconditionally,
  // honouring React's rules of hooks regardless of events.length.
  const lastFive = events.slice(-5).reverse();
  const slots: Array<{ blockNumber: bigint; txHash: string; uri: string } | undefined> =
    [0, 1, 2, 3, 4].map((i) => lastFive[i]);

  const enriched: DecisionEntry[] = slots.map((e) => {
    const uri = e?.uri ?? "";
    const q = useQuery({
      queryKey: ["attestation-payload", uri],
      queryFn: () => fetchAttestationJson(uri),
      enabled: uri.length > 0,
      staleTime: 60_000,
    });
    if (!e) return { blockNumber: BigInt(0), txHash: "", uri: "", payload: undefined, payloadLoading: false };
    return {
      blockNumber: e.blockNumber,
      txHash: e.txHash,
      uri: e.uri,
      payload: q.data as DecisionEntry["payload"],
      payloadLoading: q.isLoading,
    };
  }).filter((e) => e.txHash !== "");

  return {
    entries: enriched,
    attestationsTotal: events.length,
    isLoading: false,
  };
}
