"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ConnectKitProvider } from "connectkit";
import { useState, type ReactNode } from "react";
import { wagmiConfig, connectKitCustomTheme } from "./wagmi";

/** Single client-side provider tree the dashboard uses. Imported into the
 *  Next.js root `layout.tsx` as a wrapper around `{children}` — keeps the
 *  layout otherwise server-rendered. */
export function Providers({ children }: { children: ReactNode }) {
  // Create the QueryClient once per browser session.
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          refetchOnWindowFocus: false,
        },
      },
    }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider customTheme={connectKitCustomTheme} options={{ initialChainId: 5000 }}>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
