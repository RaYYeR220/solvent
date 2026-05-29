import { ActionType, type AgentPolicy, type Address, type Decision } from "../types";
import { gatherSignals, type SignalSources } from "../signals";
import { assessRegime } from "../engine/assessRegime";
import { selectAction } from "../engine/selectAction";
import { computeSignalsHash, encodeReasonCode } from "../attest";
import { encodeActionParams } from "../executor/encodeAction";
import { buildAttestationPayload, serializePayload } from "../attestation/payload";
import type { Pinner } from "../attestation/ipfsPinner";

export interface ExecuteArgs {
  action: number;
  params: `0x${string}`;
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}

export interface ObserveArgs {
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
  uri: string;
}

export interface VaultSender {
  executeProtectiveAction(args: ExecuteArgs): Promise<`0x${string}`>;
  attestObservation(args: ObserveArgs): Promise<`0x${string}`>;
}

export interface TickDeps {
  sources: SignalSources;
  policy: AgentPolicy;
  sender: VaultSender;
  pinner: Pinner;
  tick: number;
  agentId: bigint;
  addresses: { vault: Address; asset: Address; safeAsset: Address };
}

export interface TickResult {
  decision: Decision;
  txHash: `0x${string}` | null;
  uri: string;
}

/** One stateless cycle: gather → assess → select → pin canonical payload to
 *  IPFS → write to vault (which dual-writes to ERC-8004 internally). Any step
 *  that throws aborts the tick; the next cron invocation starts clean.
 *
 *  We pin BEFORE writing so the URI is committed and immutable at the moment
 *  the on-chain record is created. The on-chain `feedbackHash` (computed by
 *  SolventAttestation.record) hashes the URI string, locking the link. */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const signals = await gatherSignals(deps.sources);
  const regime = assessRegime(signals, deps.policy);
  const decision = selectAction(regime, signals, deps.policy);

  const signalsHash = computeSignalsHash(signals);
  const reasonCode = encodeReasonCode(decision.reasonCode);

  const payload = buildAttestationPayload({
    tick: deps.tick,
    agentId: deps.agentId,
    vaultAddress: deps.addresses.vault,
    signals,
    regime,
    decision,
    txHash: null,
  });
  const uri = await deps.pinner(serializePayload(payload));

  if (decision.plan.action === ActionType.NONE) {
    const txHash = await deps.sender.attestObservation({ regime, reasonCode, signalsHash, uri });
    return { decision, txHash, uri };
  }

  const params = encodeActionParams(decision.plan, { asset: deps.addresses.asset, safeAsset: deps.addresses.safeAsset });
  const txHash = await deps.sender.executeProtectiveAction({
    action: decision.plan.action,
    params,
    regime,
    reasonCode,
    signalsHash,
    uri,
  });
  return { decision, txHash, uri };
}
