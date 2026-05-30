import Link from "next/link";
import BrandMark from "./BrandMark";

interface HeaderProps {
  ctaHref: string;
  ctaLabel: string;
}

export default function Header({ ctaHref, ctaLabel }: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "24px 0",
        marginBottom: 36,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BrandMark size={28} />
        <div>
          <div style={{ fontSize: 16, letterSpacing: "0.08em", color: "var(--text-strong)", fontWeight: 500 }}>SOLVENT</div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-cyan)", opacity: 0.7, marginTop: 1 }}>
            DEPEG.GUARDIAN
          </div>
        </div>
      </Link>
      <Link
        href={ctaHref}
        className="mono"
        style={{
          border: "1px solid var(--ink-cyan)",
          color: "var(--ink-cyan)",
          padding: "9px 18px",
          fontSize: 11.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          borderRadius: 2,
        }}
      >
        {ctaLabel}
      </Link>
    </header>
  );
}
