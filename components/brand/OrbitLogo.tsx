import { useId } from "react";

/** A glowing planet with a tilted ring and a satellite. */
export function OrbitLogo({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
      <defs>
        <radialGradient id={`${id}-core`} cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#E0FBFF" />
          <stop offset="45%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#7C3AED" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <circle cx="24" cy="24" r="9" fill={`url(#${id}-core)`} filter={`url(#${id}-glow)`} opacity="0.7" />
      <circle cx="24" cy="24" r="8.5" fill={`url(#${id}-core)`} />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="8"
        transform="rotate(-24 24 24)"
        fill="none"
        stroke={`url(#${id}-ring)`}
        strokeWidth="2"
      />
      <circle cx="41" cy="16.5" r="2.6" fill="#F472B6" />
      <circle cx="41" cy="16.5" r="4" fill="#F472B6" opacity="0.35" filter={`url(#${id}-glow)`} />
    </svg>
  );
}
