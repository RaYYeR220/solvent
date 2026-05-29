export interface VaultState {
  protectedPositionUsd: number;
  usdyBalance: number;
  entryUsd: number;
  deltaPct: number;
  marketPrice: number;
  navPrice: number;
  spreadBps: number;
  regime: "CALM" | "EARLY" | "TERMINAL";
  divergenceBps: number;
  tickLabel: string;     // e.g. "14:02"
  attestationsAttested: number;
  attestationsTotal: number;
  address: string;       // truncated display
  asset: string;
  network: string;
  agentRevision: string; // "v2.4.1"
  drawingId: string;     // "DWG-001"
}

export interface PolicyView {
  earlyTrigBps: number;
  termTrigBps: number;
  maxLtvPct: number;
  safeAsset: string;
  slippageCapBps: number;
}

export interface LogEntry {
  timestamp: string;   // "14:02"
  reasonCode: "park-calm" | "observe" | "bridge" | "unwind" | "swap";
  description: string;
  txShort: string;     // "0x84…f2"
}

export interface PolicyPreset {
  id: "aggressive" | "balanced" | "terminal-only";
  name: string;
  description: string;
  earlyTrigBps: number;
  termTrigBps: number;
  maxLtvPct: number;
}

export const mockVault: VaultState = {
  protectedPositionUsd: 98540,
  usdyBalance: 982.04,
  entryUsd: 100000,
  deltaPct: 0,
  marketPrice: 0.998,
  navPrice: 1.000,
  spreadBps: -2,
  regime: "CALM",
  divergenceBps: 0,
  tickLabel: "14:02",
  attestationsAttested: 11,
  attestationsTotal: 11,
  address: "0x7a4f…e1b3",
  asset: "USDY",
  network: "MANTLE",
  agentRevision: "v2.4.1",
  drawingId: "DWG-001",
};

export const mockPolicy: PolicyView = {
  earlyTrigBps: 50,
  termTrigBps: 1000,
  maxLtvPct: 50,
  safeAsset: "USDC",
  slippageCapBps: 300,
};

export const mockLog: LogEntry[] = [
  { timestamp: "14:02", reasonCode: "park-calm", description: "yield deployed, no divergence", txShort: "0x84…f2" },
  { timestamp: "13:02", reasonCode: "park-calm", description: "yield deployed", txShort: "0x71…b9" },
  { timestamp: "12:02", reasonCode: "observe", description: "brief 38 bps watch · no action", txShort: "0x5e…3a" },
  { timestamp: "11:02", reasonCode: "park-calm", description: "yield deployed", txShort: "0x42…d8" },
  { timestamp: "10:02", reasonCode: "park-calm", description: "yield deployed", txShort: "0x39…1c" },
];

export const PRESETS: PolicyPreset[] = [
  {
    id: "aggressive",
    name: "Aggressive",
    description: "Bridge on the first sign of stress. Lowest losses on terminal collapses, but exits early on noise.",
    earlyTrigBps: 30,
    termTrigBps: 800,
    maxLtvPct: 50,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Moderate triggers. Recommended default. The canonical mockup uses these numbers.",
    earlyTrigBps: 50,
    termTrigBps: 1000,
    maxLtvPct: 50,
  },
  {
    id: "terminal-only",
    name: "Terminal-only",
    description: "Holds through transient depegs. Only acts when divergence is unambiguously terminal.",
    earlyTrigBps: 200,
    termTrigBps: 1500,
    maxLtvPct: 40,
  },
];
