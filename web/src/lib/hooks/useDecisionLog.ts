"use client";

import { useMemo, useState } from "react";
import { useWatchContractEvent, usePublicClient } from "wagmi";
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
    timestamp?: number;
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
// ~7 days at 2s/block on Mantle. The chart only needs a recent window;
// fetching further back is wasted RPC budget.
const HISTORICAL_LOOKBACK_BLOCKS = BigInt(50_000);

// Single-event ABI fragment for getLogs — equivalent to the entry in
// `reputationRegistryAbi` but typed as a literal so viem's argument-type
// inference is happy.
const NEW_FEEDBACK_EVENT = reputationRegistryAbi[0];

export function useDecisionLog(): DecisionLogLive {
  const [events, setEvents] = useState<Array<{ blockNumber: bigint; txHash: string; uri: string }>>([]);
  const publicClient = usePublicClient();

  // Historical backfill — useWatchContractEvent only sees NEW events from
  // mount-time forward, so without this the first page load shows an empty
  // chart + log until the agent's next attestation lands.
  const historical = useQuery({
    queryKey: [
      "historical-attestations",
      CONTRACTS.reputationRegistry,
      String(CONTRACTS.agentId),
    ],
    queryFn: async (): Promise<Array<{ blockNumber: bigint; txHash: string; uri: string }>> => {
      if (!publicClient) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > HISTORICAL_LOOKBACK_BLOCKS ? latest - HISTORICAL_LOOKBACK_BLOCKS : BigInt(0);
      const logs = await publicClient.getLogs({
        address: CONTRACTS.reputationRegistry,
        event: NEW_FEEDBACK_EVENT,
        args: { agentId: CONTRACTS.agentId },
        fromBlock,
        toBlock: "latest",
      });
      return logs.map((l) => ({
        blockNumber: l.blockNumber as bigint,
        txHash: l.transactionHash as string,
        uri: ((l as unknown as { args?: { feedbackURI?: string } }).args?.feedbackURI as string) ?? "",
      }));
    },
    staleTime: 60_000,
    enabled: !!publicClient,
  });

  useWatchContractEvent({
    address: CONTRACTS.reputationRegistry,
    abi: reputationRegistryAbi,
    eventName: "NewFeedback",
    args: { agentId: CONTRACTS.agentId },
    onLogs(logs: Log[]) {
      const decoded = logs.map((l: Log & { args?: { feedbackURI?: string } }) => ({
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

  // Merge historical + live, dedupe by txHash, ascending blockNumber.
  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ blockNumber: bigint; txHash: string; uri: string }> = [];
    for (const e of [...(historical.data ?? []), ...events]) {
      if (!e.txHash || seen.has(e.txHash)) continue;
      seen.add(e.txHash);
      out.push(e);
    }
    return out.sort((a, b) =>
      a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0,
    );
  }, [historical.data, events]);

  // Pad to fixed 5 slots so the 5 useQuery calls happen unconditionally,
  // honouring React's rules of hooks regardless of events.length.
  const lastFive = allEvents.slice(-5).reverse();
  const slots: Array<{ blockNumber: bigint; txHash: string; uri: string } | undefined> =
    [0, 1, 2, 3, 4].map((i) => lastFive[i]);

  const enriched: DecisionEntry[] = slots.map((e) => {
    const uri = e?.uri ?? "";
    // Fixed-length slots (always 5) keep hook count stable across renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
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
    attestationsTotal: allEvents.length,
    isLoading: historical.isLoading,
  };
}
