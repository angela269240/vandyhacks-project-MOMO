/**
 * The map palette: eight hues at one shared lightness and chroma (OKLCH), tuned to a soft sage.
 * The rendered light/dark values live in app/globals.css as --hue-<key>; this file only knows the keys.
 * `deg` is the OKLCH hue angle, used to keep similar hues apart on the map.
 * `swatch` is the light-mode value, kept only for records that store a color (it is never rendered).
 */
export const HUES = [
  { key: "sage", deg: 150, swatch: "#588862" },
  { key: "clay", deg: 40, swatch: "#A26A57" },
  { key: "slate", deg: 245, swatch: "#517FA6" },
  { key: "ochre", deg: 80, swatch: "#937542" },
  { key: "plum", deg: 320, swatch: "#8F6B97" },
  { key: "teal", deg: 195, swatch: "#388989" },
  { key: "rose", deg: 5, swatch: "#A26774" },
  { key: "olive", deg: 115, swatch: "#798048" },
] as const;

export type HueKey = (typeof HUES)[number]["key"];
/** "stone" is the neutral for people who aren't in any bubble. */
export type ToneKey = HueKey | "stone";

const HUE_DEG = new Map<string, number>(HUES.map((h) => [h.key, h.deg]));

/** CSS color for a palette key; follows the current theme. */
export const hueVar = (key: ToneKey) => `var(--hue-${key})`;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A group's starting hue, from its name. The map may pick another so neighbors stay distinct. */
export function preferredHue(name: string): HueKey {
  return HUES[hashString(name.trim().toLowerCase()) % HUES.length].key;
}

/** Stored value for a new group's `color` column (rendering uses the assigned hue instead). */
export function colorForName(name: string): string {
  return HUES.find((h) => h.key === preferredHue(name))!.swatch;
}

/** A person's identity color comes from their first interest; it never depends on which bubble they're in. */
export function interestHue(interestId: number): HueKey {
  return HUES[(((interestId - 1) % HUES.length) + HUES.length) % HUES.length].key;
}
export const interestColor = (interestId: number) => hueVar(interestHue(interestId));
export const identityColor = (user: { interestIds: number[] }) =>
  user.interestIds.length ? interestColor(user.interestIds[0]) : hueVar("stone");

/** 1 for the same hue, falling to 0 for hues ≥ 110° apart. */
export function hueSimilarity(a: HueKey, b: HueKey): number {
  if (a === b) return 1;
  const d = Math.abs(HUE_DEG.get(a)! - HUE_DEG.get(b)!) % 360;
  const delta = Math.min(d, 360 - d);
  return Math.max(0, 1 - delta / 110) ** 1.5;
}

/** "#22D3EE" + 0.4 -> "rgba(34,211,238,0.4)" */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Linear blend of two #rrggbb colors, t in 0..1. */
export function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
