import { describe, it, expect } from "vitest";
import { encodeActionParams } from "../src/executor/encodeAction";
import { ActionType, type Address } from "../src/types";
import { decodeAbiParameters } from "viem";

const ASSET = "0x1111111111111111111111111111111111111111" as Address;
const SAFE = "0x2222222222222222222222222222222222222222" as Address;
const ctx = { asset: ASSET, safeAsset: SAFE };
const ONE = 10n ** 18n;

describe("encodeActionParams", () => {
  it("encodes SWAP_TO_SAFE as (uint256,uint256,address[]) with path [asset, safe]", () => {
    const enc = encodeActionParams({ action: ActionType.SWAP_TO_SAFE, amountIn: 100n * ONE, amountOutMin: 97n * 10n ** 6n }, ctx);
    const [amountIn, amountOutMin, path] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }],
      enc,
    );
    expect(amountIn).toBe(100n * ONE);
    expect(amountOutMin).toBe(97n * 10n ** 6n);
    expect(path).toEqual([ASSET, SAFE]);
  });

  it("encodes BRIDGE_VIA_LENDING as (uint256,uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.BRIDGE_VIA_LENDING, collateralAmount: 200n * ONE, borrowAmount: 100n * 10n ** 6n }, ctx);
    const [collateral, borrow] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], enc);
    expect(collateral).toBe(200n * ONE);
    expect(borrow).toBe(100n * 10n ** 6n);
  });

  it("encodes UNWIND_BRIDGE as (uint256,uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.UNWIND_BRIDGE, repayAmount: 100n * 10n ** 6n, withdrawAmount: 200n * ONE }, ctx);
    const [repay, withdraw] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], enc);
    expect(repay).toBe(100n * 10n ** 6n);
    expect(withdraw).toBe(200n * ONE);
  });

  it("encodes PARK_YIELD as (uint256)", () => {
    const enc = encodeActionParams({ action: ActionType.PARK_YIELD, amount: 300n * ONE }, ctx);
    const [amount] = decodeAbiParameters([{ type: "uint256" }], enc);
    expect(amount).toBe(300n * ONE);
  });

  it("encodes NONE as empty bytes", () => {
    expect(encodeActionParams({ action: ActionType.NONE }, ctx)).toBe("0x");
  });
});
