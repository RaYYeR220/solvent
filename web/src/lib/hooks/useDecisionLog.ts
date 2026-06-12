"use client";

import { useMemo, useState } from "react";
import { useWatchContractEvent, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CONTRACTS } from "../contracts";
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
// ~9 days at ~2s/block on Mantle. Wide enough to reach the agent's full
// attestation history so the chart + decision_log paint immediately on first
// load rather than waiting for the next hourly tick. rpc.mantle.xyz serves
// this range in a single getLogs call, so no pagination needed. Env-overridable
// (NEXT_PUBLIC_LOOKBACK_BLOCKS) so an anvil fork — whose demo attestations are
// all very recent — can use a small range and avoid a slow initial getLogs.
// Prod leaves it unset → 400k unchanged.
const HISTORICAL_LOOKBACK_BLOCKS = BigInt(process.env.NEXT_PUBLIC_LOOKBACK_BLOCKS ?? "400000");
// Live-watch poll cadence. Default 12s; lower on the fork
// (NEXT_PUBLIC_WATCH_INTERVAL_MS) for snappier demo updates. Prod unset → 12s.
const WATCH_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_WATCH_INTERVAL_MS ?? "12000");

// The agent's decisions are recorded on the SolventAttestation contract via
// `DecisionRecorded` — NOT as `NewFeedback` on the shared ERC-8004
// ReputationRegistry. The contract DOES best-effort mirror each decision to
// the registry's `giveFeedback`, but that call currently reverts (caught +
// emitted as `MirrorFailed`), so the registry holds zero agent-106 feedback.
// `DecisionRecorded` fires reliably and carries the agentId (indexed) + the
// IPFS `uri` we need for the chart payload, so it's the canonical source.
const DECISION_RECORDED_EVENT = {
  type: "event",
  name: "DecisionRecorded",
  inputs: [
    { name: "agentId", type: "uint256", indexed: true },
    { name: "vault", type: "address", indexed: true },
    { name: "index", type: "uint256", indexed: true },
    { name: "regime", type: "uint8", indexed: false },
    { name: "reasonCode", type: "bytes32", indexed: false },
    { name: "signalsHash", type: "bytes32", indexed: false },
    { name: "action", type: "uint8", indexed: false },
    { name: "outcome", type: "int256", indexed: false },
    { name: "uri", type: "string", indexed: false },
  ],
} as const;

const ATTESTATION_ABI = [DECISION_RECORDED_EVENT] as const;

export function useDecisionLog(): DecisionLogLive {
  const [events, setEvents] = useState<Array<{ blockNumber: bigint; txHash: string; uri: string }>>([]);
  const publicClient = usePublicClient();

  // Historical backfill — useWatchContractEvent only sees NEW events from
  // mount-time forward, so without this the first page load shows an empty
  // chart + log until the agent's next attestation lands.
  const historical = useQuery({
    queryKey: [
      "historical-decisions",
      CONTRACTS.attestation,
      String(CONTRACTS.agentId),
    ],
    queryFn: async (): Promise<Array<{ blockNumber: bigint; txHash: string; uri: string }>> => {
      if (!publicClient) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > HISTORICAL_LOOKBACK_BLOCKS ? latest - HISTORICAL_LOOKBACK_BLOCKS : BigInt(0);
      const logs = await publicClient.getLogs({
        address: CONTRACTS.attestation,
        event: DECISION_RECORDED_EVENT,
        args: { agentId: CONTRACTS.agentId },
        fromBlock,
        toBlock: "latest",
      });
      return logs.map((l) => ({
        blockNumber: l.blockNumber as bigint,
        txHash: l.transactionHash as string,
        uri: ((l as unknown as { args?: { uri?: string } }).args?.uri as string) ?? "",
      }));
    },
    staleTime: 60_000,
    enabled: !!publicClient,
  });

  useWatchContractEvent({
    address: CONTRACTS.attestation,
    abi: ATTESTATION_ABI,
    eventName: "DecisionRecorded",
    args: { agentId: CONTRACTS.agentId },
    onLogs(logs: Log[]) {
      const decoded = logs.map((l: Log & { args?: { uri?: string } }) => ({
        blockNumber: l.blockNumber as bigint,
        txHash: l.transactionHash as string,
        uri: (l.args?.uri as string) ?? "",
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
    pollingInterval: WATCH_INTERVAL_MS,
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
