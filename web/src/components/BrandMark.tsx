interface BrandMarkProps {
  size?: number;
}

export default function BrandMark({ size = 32 }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-label="Solvent">
      <rect x="2" y="2" width="28" height="28" fill="none" stroke="var(--ink-cyan)" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--ink-cyan)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="1.6" fill="var(--ink-cyan)" />
      <line x1="16" y1="2" x2="16" y2="9" stroke="var(--ink-cyan)" strokeWidth="1.1" />
      <line x1="16" y1="23" x2="16" y2="30" stroke="var(--ink-cyan)" strokeWidth=".7" opacity=".6" />
      <line x1="2" y1="16" x2="9" y2="16" stroke="var(--ink-cyan)" strokeWidth=".7" opacity=".6" />
      <line x1="23" y1="16" x2="30" y2="16" stroke="var(--ink-cyan)" strokeWidth=".7" opacity=".6" />
      <path d="M2,8 L2,2 L8,2" fill="none" stroke="var(--ink-cyan)" strokeWidth="2" />
      <path d="M30,8 L30,2 L24,2" fill="none" stroke="var(--ink-cyan)" strokeWidth="2" />
      <path d="M2,24 L2,30 L8,30" fill="none" stroke="var(--ink-cyan)" strokeWidth="2" />
      <path d="M30,24 L30,30 L24,30" fill="none" stroke="var(--ink-cyan)" strokeWidth="2" />
    </svg>
  );
}
