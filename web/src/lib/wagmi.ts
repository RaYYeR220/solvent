import { http, createConfig } from "wagmi";
import { mantle } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_MANTLE_RPC ?? "https://rpc.mantle.xyz";
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

if (typeof window !== "undefined" && !wcProjectId) {
  console.warn(
    "Solvent: NEXT_PUBLIC_WC_PROJECT_ID is empty — WalletConnect will fail. " +
    "Create a project at https://cloud.walletconnect.com and set the env var.",
  );
}

export const wagmiConfig = createConfig({
  chains: [mantle],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: wcProjectId, showQrModal: false }),
    coinbaseWallet({ appName: "Solvent" }),
  ],
  transports: { [mantle.id]: http(rpcUrl) },
  ssr: true,
});

/** ConnectKit theme variables tuned to the Schematic Blueprint palette.
 *  Variable names are from https://docs.family.co/connectkit/theming. */
export const connectKitCustomTheme = {
  "--ck-font-family": "var(--font-mono), monospace",
  "--ck-border-radius": "2px",
  "--ck-overlay-background": "rgba(10, 25, 50, 0.85)",
  "--ck-body-background": "#0a1932",
  "--ck-body-background-secondary": "#0e2342",
  "--ck-body-color": "#cfe7ff",
  "--ck-body-color-muted": "rgba(207, 231, 255, 0.55)",
  "--ck-primary-button-background": "#0a1932",
  "--ck-primary-button-color": "#7cd5ff",
  "--ck-primary-button-border-color": "#7cd5ff",
  "--ck-primary-button-hover-background": "rgba(124, 213, 255, 0.08)",
  "--ck-focus-color": "#7cd5ff",
};
