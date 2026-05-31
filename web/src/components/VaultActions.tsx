"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract } from "wagmi";
import Panel from "./Panel";
import { CONTRACTS, erc20Abi, vaultAbi } from "../lib/contracts";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDeposit } from "../lib/hooks/useDeposit";
import { useWithdraw } from "../lib/hooks/useWithdraw";

const ASSET_DECIMALS = 6;
const SHARE_DECIMALS = 6;

const ASSET_SYMBOL = "USDT0";
const SHARE_SYMBOL = "svUSDT0";
const SAFE_SYMBOL = "USDC";

// ---------- formatting helpers ----------

function parseAmount(raw: string, decimals: number): bigint {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return BigInt(0);
  return BigInt(Math.floor(n * 10 ** decimals));
}

function fmtUnits(raw: bigint, decimals: number, max = 2): string {
  return (Number(raw) / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: max,
  });
}

/** Display-friendly raw-string version of a bigint amount (no commas) for
 *  prefilling the input via MAX. */
function rawToInput(raw: bigint, decimals: number): string {
  const whole = raw / BigInt(10 ** decimals);
  const frac = raw % BigInt(10 ** decimals);
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function fmtAgo(ms: number): string {
  if (ms < 30_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---------- shared style atoms ----------

const inputStyle: React.CSSProperties = {
  background: "rgba(124,213,255,.04)",
  border: "1px solid rgba(124,213,255,.25)",
  color: "var(--text-strong)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 18,
  width: "100%",
  outline: "none",
  borderRadius: 2,
};

const maxBtnStyle: React.CSSProperties = {
  cursor: "pointer",
  background: "transparent",
  border: "1px solid rgba(124,213,255,.35)",
  color: "var(--ink-cyan)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  borderRadius: 2,
};

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "transparent" : "var(--ink-cyan)",
  border: "1px solid var(--ink-cyan)",
  color: disabled ? "var(--ink-cyan)" : "var(--bg-deep, #0a1932)",
  padding: "12px 16px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  borderRadius: 2,
  opacity: disabled ? 0.4 : 1,
  width: "100%",
});

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.14em",
  color: "var(--ink-cyan)",
  opacity: 0.75,
  textTransform: "lowercase",
  marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.14em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

// ---------- session log ----------

type LogKind = "approved" | "deposited" | "withdrawn";
interface SessionLogEntry {
  kind: LogKind;
  amount: bigint;
  decimals: number;
  symbol: string;
  timestamp: number;
}

function SessionLog({ entries, now }: { entries: SessionLogEntry[]; now: number }) {
  const recent = entries.slice(-2).reverse();
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed rgba(124,213,255,.18)" }}>
      <div className="mono" style={{ ...sectionTitleStyle, marginBottom: 8 }}>{"// session_log"}</div>
      {recent.length === 0 ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.7 }}>
          {"// no actions yet  ·  perform a deposit or withdrawal to see history"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {recent.map((e, i) => (
            <div key={i} className="mono" style={{ fontSize: 11.5, color: "var(--text-strong)" }}>
              <span style={{ color: "var(--ink-cyan)" }}>✓ {e.kind.padEnd(10, " ")}</span>
              <span>{fmtUnits(e.amount, e.decimals, 4)} {e.symbol}</span>
              <span style={{ color: "var(--text-muted)" }}>  ·  {fmtAgo(now - e.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- component ----------

export default function VaultActions() {
  const { address, isConnected } = useAccount();
  const vault = useVaultState();
  const dep = useDeposit();
  const wd = useWithdraw();

  const [depositAmount, setDepositAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);

  // tick `now` every 30s so session_log "X ago" strings stay fresh.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Wallet USDT0 balance (for deposit MAX + bal label).
  const walletBalRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const walletBal = (walletBalRead.data as bigint | undefined) ?? BigInt(0);

  // Allowance gate for deposit (approve vs deposit branch on the single button).
  const allowanceRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.vault] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const allowance = (allowanceRead.data as bigint | undefined) ?? BigInt(0);

  // Vault total supply — used to compute the pro-rata withdraw breakdown in safe mode.
  const totalSupplyRead = useReadContract({
    address: CONTRACTS.vault,
    abi: vaultAbi,
    functionName: "totalSupply",
    query: { refetchInterval: 12_000 },
  });
  const totalSupply = (totalSupplyRead.data as bigint | undefined) ?? BigInt(0);

  const depAmountRaw = parseAmount(depositAmount, ASSET_DECIMALS);
  const wdAmountRaw = parseAmount(withdrawAmount, SHARE_DECIMALS);
  const safeMode = vault.safeAssetBalance > BigInt(0);

  // --- session_log: append on state transitions to "done" ---
  const lastDepStateRef = useRef(dep.state);
  const lastWdStateRef = useRef(wd.state);
  // Snapshot the amount that was in-flight at the moment of submission. We can
  // capture from current input state since the buttons stay disabled
  // while in-flight, so the value cannot change underneath us.
  const pendingDepAmountRef = useRef<bigint>(BigInt(0));
  const pendingApproveAmountRef = useRef<bigint>(BigInt(0));
  const pendingWdAmountRef = useRef<bigint>(BigInt(0));

  useEffect(() => {
    const prev = lastDepStateRef.current;
    const curr = dep.state;
    lastDepStateRef.current = curr;
    if (prev === "approving" && curr === "approve-confirmed") {
      setSessionLog((log) => [...log, {
        kind: "approved",
        amount: pendingApproveAmountRef.current,
        decimals: ASSET_DECIMALS,
        symbol: ASSET_SYMBOL,
        timestamp: Date.now(),
      }]);
    }
    if (prev === "depositing" && curr === "done") {
      setSessionLog((log) => [...log, {
        kind: "deposited",
        amount: pendingDepAmountRef.current,
        decimals: ASSET_DECIMALS,
        symbol: ASSET_SYMBOL,
        timestamp: Date.now(),
      }]);
    }
  }, [dep.state]);

  useEffect(() => {
    const prev = lastWdStateRef.current;
    const curr = wd.state;
    lastWdStateRef.current = curr;
    if (prev === "redeeming" && curr === "done") {
      setSessionLog((log) => [...log, {
        kind: "withdrawn",
        amount: pendingWdAmountRef.current,
        decimals: SHARE_DECIMALS,
        symbol: SHARE_SYMBOL,
        timestamp: Date.now(),
      }]);
    }
  }, [wd.state]);

  // --- wallet-not-connected fallback ---
  if (!isConnected) {
    return (
      <Panel title={`// vault_actions`} meta="[ EXEC ]" style={{ height: "100%" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 16, padding: "40px 0", minHeight: 240,
        }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Connect a wallet to deposit or withdraw.
          </div>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} style={primaryBtnStyle(false)}>
                [ connect wallet ]
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </Panel>
    );
  }

  // ---------- deposit side ----------
  const depBusy = dep.state === "approving" || dep.state === "depositing";
  const depNeedsApprove = depAmountRaw > BigInt(0) && allowance < depAmountRaw;

  let depLabel: string;
  let depDisabled = false;
  if (dep.state === "approving") { depLabel = "APPROVING…"; depDisabled = true; }
  else if (dep.state === "depositing") { depLabel = "DEPOSITING…"; depDisabled = true; }
  else if (dep.state === "done") { depLabel = "DEPOSITED ✓"; depDisabled = true; }
  else if (depAmountRaw === BigInt(0)) { depLabel = "ENTER AMOUNT"; depDisabled = true; }
  else if (depNeedsApprove) { depLabel = `APPROVE ${fmtUnits(depAmountRaw, ASSET_DECIMALS, 4)} ${ASSET_SYMBOL}`; }
  else { depLabel = `DEPOSIT ${fmtUnits(depAmountRaw, ASSET_DECIMALS, 4)} ${ASSET_SYMBOL}`; }

  const onDepPrimary = async () => {
    if (depAmountRaw === BigInt(0)) return;
    if (depNeedsApprove) {
      pendingApproveAmountRef.current = depAmountRaw;
      await dep.approve(depAmountRaw);
    } else {
      pendingDepAmountRef.current = depAmountRaw;
      await dep.deposit(depAmountRaw);
    }
  };

  // ---------- withdraw side ----------
  let wdLabel: string;
  let wdDisabled = false;
  if (wd.state === "redeeming") { wdLabel = "WITHDRAWING…"; wdDisabled = true; }
  else if (wd.state === "done") { wdLabel = "WITHDRAWN ✓"; wdDisabled = true; }
  else if (wdAmountRaw === BigInt(0)) { wdLabel = "ENTER AMOUNT"; wdDisabled = true; }
  else { wdLabel = `WITHDRAW ${fmtUnits(wdAmountRaw, SHARE_DECIMALS, 4)} ${SHARE_SYMBOL}`; }

  const onWdPrimary = async () => {
    if (wdAmountRaw === BigInt(0) || !address) return;
    pendingWdAmountRef.current = wdAmountRaw;
    if (safeMode) {
      await wd.redeemAll(wdAmountRaw, address);
    } else {
      await wd.redeem(wdAmountRaw, address, address);
    }
  };

  // Pro-rata mix for safe-mode withdraw display.
  // shares/totalSupply * each vault balance.
  let withdrawReceive: React.ReactNode;
  if (safeMode && totalSupply > BigInt(0) && wdAmountRaw > BigInt(0)) {
    const riskOut = (wdAmountRaw * vault.riskAssetBalance) / totalSupply;
    const safeOut = (wdAmountRaw * vault.safeAssetBalance) / totalSupply;
    withdrawReceive = (
      <span>
        ~ {fmtUnits(riskOut, ASSET_DECIMALS, 4)} {ASSET_SYMBOL}
        {" + "}
        {fmtUnits(safeOut, ASSET_DECIMALS, 4)} {SAFE_SYMBOL}
      </span>
    );
  } else {
    withdrawReceive = (
      <span>
        {fmtUnits(wdAmountRaw, SHARE_DECIMALS, 4)} {ASSET_SYMBOL}
      </span>
    );
  }

  // ---------- render ----------
  return (
    <Panel title={`// vault_actions`} meta="[ EXEC ]" style={{ height: "100%" }}>
      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {/* ---------------- DEPOSIT COLUMN ---------------- */}
        <section>
          <div className="mono" style={sectionTitleStyle}>{"// deposit"}</div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div className="mono" style={labelStyle}>YOU PAY</div>
            <div className="mono" style={{ ...labelStyle, color: "var(--text-muted)" }}>
              bal {fmtUnits(walletBal, ASSET_DECIMALS, 2)} {ASSET_SYMBOL}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              disabled={depBusy}
              style={inputStyle}
              aria-label="deposit amount"
            />
            <button
              type="button"
              onClick={() => setDepositAmount(rawToInput(walletBal, ASSET_DECIMALS))}
              disabled={depBusy || walletBal === BigInt(0)}
              style={maxBtnStyle}
            >
              MAX
            </button>
          </div>
          <div className="mono" style={{ ...labelStyle, marginTop: 4, opacity: 0.6 }}>{ASSET_SYMBOL}</div>

          <div style={{ textAlign: "center", margin: "12px 0 8px", color: "var(--ink-cyan)", opacity: 0.55, fontSize: 14 }}>↓</div>

          <div className="mono" style={{ ...labelStyle, marginBottom: 6 }}>YOU RECEIVE</div>
          <div className="mono" style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            padding: "10px 12px", border: "1px solid rgba(124,213,255,.15)",
            background: "rgba(124,213,255,.02)", borderRadius: 2,
          }}>
            <span style={{ fontSize: 18, color: "var(--text-strong)" }}>
              {fmtUnits(depAmountRaw, ASSET_DECIMALS, 4)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{SHARE_SYMBOL}</span>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={onDepPrimary}
              disabled={depDisabled}
              style={primaryBtnStyle(depDisabled)}
            >
              {depLabel}
            </button>
          </div>

          {dep.error && (
            <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)", marginTop: 8 }}>
              error: {dep.error}
            </div>
          )}
        </section>

        {/* ---------------- WITHDRAW COLUMN ---------------- */}
        <section>
          <div className="mono" style={sectionTitleStyle}>{"// withdraw"}</div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div className="mono" style={labelStyle}>YOU BURN</div>
            <div className="mono" style={{ ...labelStyle, color: "var(--text-muted)" }}>
              pos {fmtUnits(vault.userShares, SHARE_DECIMALS, 2)} {SHARE_SYMBOL}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              disabled={wd.state === "redeeming"}
              style={inputStyle}
              aria-label="withdraw amount"
            />
            <button
              type="button"
              onClick={() => setWithdrawAmount(rawToInput(vault.userShares, SHARE_DECIMALS))}
              disabled={wd.state === "redeeming" || vault.userShares === BigInt(0)}
              style={maxBtnStyle}
            >
              MAX
            </button>
          </div>
          <div className="mono" style={{ ...labelStyle, marginTop: 4, opacity: 0.6 }}>{SHARE_SYMBOL}</div>

          <div style={{ textAlign: "center", margin: "12px 0 8px", color: "var(--ink-cyan)", opacity: 0.55, fontSize: 14 }}>↓</div>

          <div className="mono" style={{ ...labelStyle, marginBottom: 6 }}>YOU RECEIVE</div>
          <div className="mono" style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            padding: "10px 12px", border: "1px solid rgba(124,213,255,.15)",
            background: "rgba(124,213,255,.02)", borderRadius: 2,
          }}>
            <span style={{ fontSize: safeMode && wdAmountRaw > BigInt(0) ? 13 : 18, color: "var(--text-strong)" }}>
              {withdrawReceive}
            </span>
          </div>

          {safeMode && (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--warm-gold)", marginTop: 6, opacity: 0.85 }}>
              safe mode: pro-rata payout in {ASSET_SYMBOL} + {SAFE_SYMBOL}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={onWdPrimary}
              disabled={wdDisabled}
              style={primaryBtnStyle(wdDisabled)}
            >
              {wdLabel}
            </button>
          </div>

          {wd.error && (
            <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)", marginTop: 8 }}>
              error: {wd.error}
            </div>
          )}
        </section>
      </div>

      <SessionLog entries={sessionLog} now={now} />
    </Panel>
  );
}
