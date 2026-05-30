import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PolicyPanel from "../src/components/PolicyPanel";

describe("PolicyPanel", () => {
  it("renders all rows including allow_swap, allow_bridge, kill_switch", () => {
    const { getByText } = render(
      <PolicyPanel
        policy={{
          earlyTrigBps: 50,
          termTrigBps: 500,
          maxLtvPct: 0,
          safeAsset: "USDC",
          slippageCapBps: 300,
          allowSwap: true,
          allowBridge: false,
          killSwitch: false,
        }}
      />,
    );
    expect(getByText("early_trig")).toBeTruthy();
    expect(getByText("term_trig")).toBeTruthy();
    expect(getByText("max_ltv")).toBeTruthy();
    expect(getByText("safe_asset")).toBeTruthy();
    expect(getByText("slippage_cap")).toBeTruthy();
    expect(getByText("allow_swap")).toBeTruthy();
    expect(getByText("allow_bridge")).toBeTruthy();
    expect(getByText("kill_switch")).toBeTruthy();
    expect(getByText("OFF")).toBeTruthy();
  });
});
