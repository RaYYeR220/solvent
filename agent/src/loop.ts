import { ActionType, type AgentPolicy, type Address, type Decision } from "./types";
import { gatherSignals, type SignalSources } from "./signals";
import { assessRegime } from "./engine/assessRegime";
import { selectAction } from "./engine/selectAction";
import { computeSignalsHash, encodeReasonCode } from "./attest";
import { encodeActionParams } from "./executor/encodeAction";

export interface ExecuteArgs {
  action: number;
  params: `0x${string}`;
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
}

export interface ObserveArgs {
  regime: number;
  reasonCode: `0x${string}`;
  signalsHash: `0x${string}`;
}

export interface VaultSender {
  executeProtectiveAction(args: ExecuteArgs): Promise<`0x${string}`>;
  attestObservation(args: ObserveArgs): Promise<`0x${string}`>;
}

export interface TickDeps {
  sources: SignalSources;
  policy: AgentPolicy;
  sender: VaultSender;
  addresses: { asset: Address; safeAsset: Address };
}

export interface TickResult {
  decision: Decision;
  txHash: `0x${string}` | null;
}

/** One decision cycle: gather signals -> assess regime -> select action -> submit (or observe). */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const signals = await gatherSignals(deps.sources);
  const regime = assessRegime(signals, deps.policy);
  const decision = selectAction(regime, signals, deps.policy);

  const signalsHash = computeSignalsHash(signals);
  const reasonCode = encodeReasonCode(decision.reasonCode);

  if (decision.plan.action === ActionType.NONE) {
    const txHash = await deps.sender.attestObservation({ regime, reasonCode, signalsHash });
    return { decision, txHash };
  }

  const params = encodeActionParams(decision.plan, deps.addresses);
  const txHash = await deps.sender.executeProtectiveAction({
    action: decision.plan.action,
    params,
    regime,
    reasonCode,
    signalsHash,
  });
  return { decision, txHash };
}
