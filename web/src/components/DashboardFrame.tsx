import type { ReactNode } from "react";
import SchematicBackground from "./SchematicBackground";

interface DashboardFrameProps {
  children: ReactNode;
}

/** The schematic-blueprint frame that wraps every dashboard view. */
export default function DashboardFrame({ children }: DashboardFrameProps) {
  return (
    <div
      style={{
        background: "var(--bg-base)",
        color: "var(--text-body)",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
      }}
    >
      <SchematicBackground />
      <div style={{ padding: 28, position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
