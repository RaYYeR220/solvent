"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract } from "wagmi";
import Panel from "./Panel";
import { CONTRACTS, erc20Abi } from "../lib/contracts";
import { useVaultState } from "../lib/hooks/useVaultState";
import { useDeposit } from "../lib/hooks/useDeposit";
import { useWithdraw } from "../lib/hooks/useWithdraw";

const ASSET_DECIMALS = 6;
const SHARE_DECIMALS = 6;
const EXPLORER = process.env.NEXT_PUBLIC_MANTLESCAN_URL ?? "https://mantlescan.xyz";

function parseAmount(raw: string, decimals: number): bigint {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return BigInt(0);
  return BigInt(Math.floor(n * 10 ** decimals));
}

function fmtUnits(raw: bigint, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txLink(hash: string | undefined, label: string) {
  if (!hash) return null;
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer"
       className="mono" style={{ fontSize: 11, color: "var(--ink-cyan)" }}>
      {label} → {hash.slice(0, 10)}…
    </a>
  );
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  cursor: "pointer",
  background: active ? "rgba(124,213,255,.08)" : "transparent",
  border: "1px solid var(--ink-cyan)",
  color: "var(--ink-cyan)",
  padding: "8px 18px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 0,
});

const inputStyle: React.CSSProperties = {
  background: "rgba(124,213,255,.04)",
  border: "1px solid rgba(124,213,255,.25)",
  color: "var(--text-strong)",
  padding: "8px 12px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 14,
  width: 180,
};

const actionBtnStyle = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "transparent" : "var(--ink-cyan)",
  border: "1px solid var(--ink-cyan)",
  color: disabled ? "var(--ink-cyan)" : "var(--bg-deep, #0a1932)",
  padding: "10px 22px",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 12,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: 2,
  opacity: disabled ? 0.4 : 1,
});

export default function VaultActions() {
  const { address, isConnected } = useAccount();
  const vault = useVaultState();
  const dep = useDeposit();
  const wd = useWithdraw();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState<string>("");

  const allowanceRead = useReadContract({
    address: CONTRACTS.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.vault] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const allowance = (allowanceRead.data as bigint | undefined) ?? BigInt(0);
  const amountRaw = parseAmount(amount, ASSET_DECIMALS);

  if (!isConnected) {
    return (
      <Panel title={`// vault_actions`} meta="[ EXEC ]">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: "10px 0" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Connect a wallet to deposit or withdraw.
          </div>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} style={actionBtnStyle(false)}>
                [ connect wallet ]
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </Panel>
    );
  }

  // ---- DEPOSIT TAB ----
  const depositPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {"// amount (USDT0)"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={dep.state === "approving" || dep.state === "depositing"}
          style={inputStyle}
        />
      </div>

      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <div>your shares: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(vault.userShares, SHARE_DECIMALS)} svUSDT0</span></div>
        <div>allowance: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(allowance, ASSET_DECIMALS)} USDT0</span></div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={async () => {
            if (amountRaw === BigInt(0)) return;
            await dep.approve(amountRaw);
          }}
          disabled={allowance >= amountRaw || amountRaw === BigInt(0) || dep.state === "approving"}
          style={actionBtnStyle(allowance >= amountRaw || amountRaw === BigInt(0))}
        >
          {dep.state === "approving" ? "[ approving… ]" : "[ approve ]"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (amountRaw === BigInt(0)) return;
            await dep.deposit(amountRaw);
          }}
          disabled={allowance < amountRaw || amountRaw === BigInt(0) || dep.state === "depositing"}
          style={actionBtnStyle(allowance < amountRaw || amountRaw === BigInt(0))}
        >
          {dep.state === "depositing" ? "[ depositing… ]" : dep.state === "done" ? "[ deposited ✓ ]" : "[ deposit ]"}
        </button>
      </div>

      {txLink(dep.approveTxHash, "approve tx")}
      {txLink(dep.depositTxHash, "deposit tx")}
      {dep.error && (
        <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
          error: {dep.error}
        </div>
      )}
    </div>
  );

  // ---- WITHDRAW TAB ----
  const safeMode = vault.safeAssetBalance > BigInt(0);
  // 1:1 approximation — convertToShares would be more precise but adds a read for marginal benefit.
  const sharesToBurn = amountRaw;

  const withdrawPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {"// amount (USDT0)"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={wd.state === "redeeming"}
          style={inputStyle}
        />
      </div>

      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <div>your position: <span style={{ color: "var(--text-strong)" }}>{fmtUnits(vault.userShares, SHARE_DECIMALS)} USDT0  ({fmtUnits(vault.userShares, SHARE_DECIMALS)} svUSDT0)</span></div>
        {safeMode && (
          <div style={{ color: "var(--warm-gold)" }}>
            Vault is in safe mode (USDC). Withdrawal returns a mixed USDT0+USDC pro-rata payout.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={async () => {
          if (sharesToBurn === BigInt(0) || !address) return;
          if (safeMode) {
            await wd.redeemAll(sharesToBurn, address);
          } else {
            await wd.redeem(sharesToBurn, address, address);
          }
        }}
        disabled={sharesToBurn === BigInt(0) || wd.state === "redeeming"}
        style={actionBtnStyle(sharesToBurn === BigInt(0))}
      >
        {wd.state === "redeeming" ? "[ withdrawing… ]" : wd.state === "done" ? "[ withdrawn ✓ ]" : "[ withdraw ]"}
      </button>

      {txLink(wd.txHash, "withdraw tx")}
      {wd.error && (
        <div className="mono" style={{ fontSize: 11, color: "var(--warm-gold)" }}>
          error: {wd.error}
        </div>
      )}
    </div>
  );

  return (
    <Panel title={`// vault_actions`} meta="[ EXEC ]">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 0 }}>
          <button type="button" onClick={() => setTab("deposit")}  style={tabBtnStyle(tab === "deposit")}>DEPOSIT</button>
          <button type="button" onClick={() => setTab("withdraw")} style={tabBtnStyle(tab === "withdraw")}>WITHDRAW</button>
        </div>
        {tab === "deposit" ? depositPanel : withdrawPanel}
      </div>
    </Panel>
  );
}
