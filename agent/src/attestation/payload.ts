import { ActionType, Regime, type ActionPlan, type Decision, type Signals } from "../types";

export const payloadVersion = "1.0";

/** Canonical attestation payload. All `bigint` fields are decimal strings so
 *  the JSON is portable and round-trips without precision loss. Keys are kept
 *  alphabetised by `serializePayload` for deterministic hashing/pinning. */
export interface AttestationPayload {
  version: string;
  agentId: string;
  vaultAddress: string;
  tick: number;
  timestamp: number;
  regime: keyof typeof Regime;
  signals: {
    navPrice: string;
    marketPrice: string;
    liquidityDepth: string;
    assetBalance: string;
    oracleDivergenceBps: number;
    timestamp: number;
  };
  decision: {
    action: keyof typeof ActionType;
    reasonCode: string;
  } & Record<string, string | number | undefined>;
  txHash: string | null;
}

export interface BuildArgs {
  tick: number;
  agentId: bigint;
  vaultAddress: string;
  signals: Signals;
  regime: Regime;
  decision: Decision;
  txHash: `0x${string}` | null;
}

function planFields(plan: ActionPlan): Record<string, string> {
  switch (plan.action) {
    case ActionType.SWAP_TO_SAFE:
      return { amountIn: plan.amountIn.toString(), amountOutMin: plan.amountOutMin.toString() };
    case ActionType.BRIDGE_VIA_LENDING:
      return { collateralAmount: plan.collateralAmount.toString(), borrowAmount: plan.borrowAmount.toString() };
    case ActionType.UNWIND_BRIDGE:
      return { repayAmount: plan.repayAmount.toString(), withdrawAmount: plan.withdrawAmount.toString() };
    case ActionType.PARK_YIELD:
      return { amount: plan.amount.toString() };
    case ActionType.NONE:
      return {};
  }
}

export function buildAttestationPayload(a: BuildArgs): AttestationPayload {
  return {
    version: payloadVersion,
    agentId: a.agentId.toString(),
    vaultAddress: a.vaultAddress,
    tick: a.tick,
    timestamp: a.signals.timestamp,
    regime: Regime[a.regime] as keyof typeof Regime,
    signals: {
      navPrice: a.signals.navPrice.toString(),
      marketPrice: a.signals.marketPrice.toString(),
      liquidityDepth: a.signals.liquidityDepth.toString(),
      assetBalance: a.signals.assetBalance.toString(),
      oracleDivergenceBps: a.signals.oracleDivergenceBps,
      timestamp: a.signals.timestamp,
    },
    decision: {
      action: ActionType[a.decision.plan.action] as keyof typeof ActionType,
      reasonCode: a.decision.reasonCode,
      ...planFields(a.decision.plan),
    },
    txHash: a.txHash,
  };
}

/** JSON.stringify with sorted keys (recursive). Deterministic for IPFS CID
 *  stability — same payload produces the same bytes produces the same CID. */
export function serializePayload(p: AttestationPayload): string {
  return JSON.stringify(p, replacer);
}

function replacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
  return value;
}
