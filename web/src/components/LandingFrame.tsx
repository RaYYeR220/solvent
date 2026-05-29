import type { ReactNode } from "react";
import SchematicBackground from "./SchematicBackground";

interface LandingFrameProps {
  children: ReactNode;
}

export default function LandingFrame({ children }: LandingFrameProps) {
  return (
    <div
      style={{
        background: "var(--bg-base)",
        color: "var(--text-body)",
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
      }}
    >
      <SchematicBackground />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1080, margin: "0 auto", padding: "0 28px 80px" }}>
        {children}
      </div>
    </div>
  );
}
