"use client";

import { useMemo, useState } from "react";
import { useWatchContractEvent, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CONTRACTS } from "../contracts";
import type { Log } from "viem";

export interface ReputationEntry {
  blockNumber: bigint;
  txHash: string;
  client: string; // clientAddress (who rated)
  stars: number; // value / 10^valueDecimals
  tag1: string;
  uri: string; // feedbackURI (data: or ipfs:)
}

export interface ReputationLive {
  entries: ReputationEntry[]; // most-recent-first, up to ~10
  count: number; // total feedback count
  averageStars: number; // mean of stars across all (0 if none)
  isLoading: boolean;
}

const MAX_BUFFERED = 50;
// ~9 days at ~2s/block on Mantle — same lookback as useDecisionLog so the
// reputation list paints on first load rather than waiting for a live event.
const HISTORICAL_LOOKBACK_BLOCKS = BigInt(400_000);

// ERC-8004 ReputationRegistry `NewFeedback` event. Defined as a literal
// fragment here so it can be passed directly as getLogs' `event` arg (cleaner
// than indexing into the wider reputationRegistryAbi).
const NEW_FEEDBACK_EVENT = {
  type: "event",
  name: "NewFeedback",
  inputs: [
    { name: "agentId", type: "uint256", indexed: true },
    { name: "clientAddress", type: "address", indexed: true },
    { name: "feedbackIndex", type: "uint64", indexed: false },
    { name: "value", type: "int128", indexed: false },
    { name: "valueDecimals", type: "uint8", indexed: false },
    { name: "indexedTag1", type: "string", indexed: true },
    { name: "tag1", type: "string", indexed: false },
    { name: "tag2", type: "string", indexed: false },
    { name: "endpoint", type: "string", indexed: false },
    { name: "feedbackURI", type: "string", indexed: false },
    { name: "feedbackHash", type: "bytes32", indexed: false },
  ],
} as const;

const NEW_FEEDBACK_ABI = [NEW_FEEDBACK_EVENT] as const;

interface FeedbackArgs {
  clientAddress?: string;
  value?: bigint;
  valueDecimals?: number;
  feedbackIndex?: bigint;
  tag1?: string;
  feedbackURI?: string;
}

function decodeLog(l: Log & { args?: FeedbackArgs }): ReputationEntry {
  const args = l.args ?? {};
  const value = args.value ?? BigInt(0);
  const valueDecimals = Number(args.valueDecimals ?? 0);
  return {
    blockNumber: l.blockNumber as bigint,
    txHash: l.transactionHash as string,
    client: (args.clientAddress as string) ?? "",
    stars: Number(value) / 10 ** valueDecimals,
    tag1: (args.tag1 as string) ?? "",
    uri: (args.feedbackURI as string) ?? "",
  };
}

export function useReputation(): ReputationLive {
  const [events, setEvents] = useState<ReputationEntry[]>([]);
  const publicClient = usePublicClient();

  // Historical backfill — useWatchContractEvent only sees events from mount
  // forward, so without this the panel stays empty until the next live rating.
  const historical = useQuery({
    queryKey: [
      "historical-reputation",
      CONTRACTS.reputationRegistry,
      String(CONTRACTS.agentId),
    ],
    queryFn: async (): Promise<ReputationEntry[]> => {
      if (!publicClient) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock =
        latest > HISTORICAL_LOOKBACK_BLOCKS
          ? latest - HISTORICAL_LOOKBACK_BLOCKS
          : BigInt(0);
      const logs = await publicClient.getLogs({
        address: CONTRACTS.reputationRegistry,
        event: NEW_FEEDBACK_EVENT,
        args: { agentId: CONTRACTS.agentId },
        fromBlock,
        toBlock: "latest",
      });
      return logs.map((l) => decodeLog(l as Log & { args?: FeedbackArgs }));
    },
    staleTime: 60_000,
    enabled: !!publicClient,
  });

  useWatchContractEvent({
    address: CONTRACTS.reputationRegistry,
    abi: NEW_FEEDBACK_ABI,
    eventName: "NewFeedback",
    args: { agentId: CONTRACTS.agentId },
    onLogs(logs: Log[]) {
      const decoded = logs.map((l) =>
        decodeLog(l as Log & { args?: FeedbackArgs }),
      );
      setEvents((prev) => {
        const merged = [...prev, ...decoded];
        const seen = new Set<string>();
        const out: ReputationEntry[] = [];
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

  // Merge historical + live, dedupe by txHash, DESC by blockNumber.
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: ReputationEntry[] = [];
    for (const e of [...(historical.data ?? []), ...events]) {
      if (!e.txHash || seen.has(e.txHash)) continue;
      seen.add(e.txHash);
      out.push(e);
    }
    return out.sort((a, b) =>
      a.blockNumber < b.blockNumber ? 1 : a.blockNumber > b.blockNumber ? -1 : 0,
    );
  }, [historical.data, events]);

  const averageStars = useMemo(() => {
    if (all.length === 0) return 0;
    const sum = all.reduce((acc, e) => acc + e.stars, 0);
    return sum / all.length;
  }, [all]);

  return {
    entries: all.slice(0, 10),
    count: all.length,
    averageStars,
    isLoading: historical.isLoading,
  };
}
