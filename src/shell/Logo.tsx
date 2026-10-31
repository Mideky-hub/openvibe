/** OpenVibe's mark (spec identité §4.1): a terracotta wave on a slate tile. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="pointer-events-none shrink-0">
      <rect width="64" height="64" rx="14" fill="#1A1918" />
      <path
        d="M10 36 C 18 14, 26 14, 32 32 S 46 50, 54 26"
        stroke="#D97757"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
