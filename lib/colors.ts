export const NEON = [
  "#22D3EE", // cyan
  "#A78BFA", // violet
  "#F472B6", // pink
  "#34D399", // mint
  "#FBBF24", // amber
  "#60A5FA", // blue
  "#FB7185", // coral
  "#A3E635", // lime
] as const;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorForName(name: string): string {
  return NEON[hashString(name.trim().toLowerCase()) % NEON.length];
}

/** "#22D3EE" + 0.4 -> "rgba(34,211,238,0.4)" */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
