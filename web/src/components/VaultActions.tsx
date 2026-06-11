"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract } from "wagmi";
import Panel from "./Panel";
import { CONTRACTS, erc20Abi, vaultAbi } from "../lib/contracts";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDeposit } from "../lib/hooks/useDeposit";
import { useWithdraw } from "../lib/hooks/useWithdraw";

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
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.14em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

const receiveBoxStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "10px 12px",
  border: "1px solid rgba(124,213,255,.15)",
  background: "rgba(124,213,255,.02)",
  borderRadius: 2,
};

// ---------- component ----------

export default function VaultActions() {
  const { address, isConnected } = useAccount();
  const vault = useVaultState();
  const dep = useDeposit();
  const wd = useWithdraw();

  // Token decimals come from chain (USDT0=6, USDY=18, USDC safe=6, …) so
  // deposit/withdraw parsing and every amount display are correct for ANY asset.
  const ASSET_DECIMALS = vault.assetDecimals;
  const SHARE_DECIMALS = vault.shareDecimals;
  const SAFE_DECIMALS = vault.safeDecimals;

  const [depositAmount, setDepositAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");

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

  // --- wallet-not-connected fallback ---
  if (!isConnected) {
    return (
      <Panel title={`// vault_actions`} meta="[ EXEC ]">
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 16, padding: "40px 0", minHeight: 220,
        }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Connect a wallet to deposit or withdraw.
          </div>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} style={{ ...primaryBtnStyle(false), width: "auto", padding: "12px 28px" }}>
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
      await dep.approve(depAmountRaw);
    } else {
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
    if (safeMode) {
      await wd.redeemAll(wdAmountRaw, address);
    } else {
      await wd.redeem(wdAmountRaw, address, address);
    }
  };

  // Safe-mode pro-rata mix for withdraw display: shares/totalSupply * each vault balance.
  const showSafeMix = safeMode && totalSupply > BigInt(0) && wdAmountRaw > BigInt(0);
  const riskOut = showSafeMix ? (wdAmountRaw * vault.riskAssetBalance) / totalSupply : BigInt(0);
  const safeOut = showSafeMix ? (wdAmountRaw * vault.safeAssetBalance) / totalSupply : BigInt(0);

  // ---------- render ----------
  return (
    <Panel title={`// vault_actions`} meta="[ EXEC ]" style={{ height: "100%" }}>
      <div className="reflow-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 44 }}>
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

          <div style={{ textAlign: "center", margin: "14px 0 10px", color: "var(--ink-cyan)", opacity: 0.55, fontSize: 14 }}>↓</div>

          <div className="mono" style={{ ...labelStyle, marginBottom: 6 }}>YOU RECEIVE</div>
          <div className="mono" style={receiveBoxStyle}>
            <span style={{ fontSize: 18, color: "var(--text-strong)" }}>
              {fmtUnits(depAmountRaw, ASSET_DECIMALS, 4)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{SHARE_SYMBOL}</span>
          </div>

          <div style={{ marginTop: 16 }}>
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

          <div style={{ textAlign: "center", margin: "14px 0 10px", color: "var(--ink-cyan)", opacity: 0.55, fontSize: 14 }}>↓</div>

          <div className="mono" style={{ ...labelStyle, marginBottom: 6 }}>YOU RECEIVE</div>
          {showSafeMix ? (
            <div className="mono" style={{ ...receiveBoxStyle, flexWrap: "wrap", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--text-strong)" }}>
                ~ {fmtUnits(riskOut, ASSET_DECIMALS, 4)} {ASSET_SYMBOL} + {fmtUnits(safeOut, SAFE_DECIMALS, 4)} {SAFE_SYMBOL}
              </span>
            </div>
          ) : (
            <div className="mono" style={receiveBoxStyle}>
              <span style={{ fontSize: 18, color: "var(--text-strong)" }}>
                {fmtUnits(wdAmountRaw, SHARE_DECIMALS, 4)}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{ASSET_SYMBOL}</span>
            </div>
          )}

          {safeMode && (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--warm-gold)", marginTop: 6, opacity: 0.85 }}>
              safe mode: pro-rata payout in {ASSET_SYMBOL} + {SAFE_SYMBOL}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
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
    </Panel>
  );
}
