/** A flat clay planet mark with an ink ring and sage satellite. */
export function OrbitLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
      <circle cx="24" cy="24" r="8.5" fill="var(--primary)" />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="8"
        transform="rotate(-24 24 24)"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="2"
        opacity="0.72"
      />
      <circle cx="41" cy="16.5" r="2.8" fill="var(--hue-sage)" stroke="var(--background)" strokeWidth="1" />
    </svg>
  );
}
