import { hashString } from "@/lib/colors";

/**
 * World-space layout for the map.
 * Focused bubbles sit on a phyllotaxis spiral around the origin, with your current bubble (and you) at the center.
 * Unfocused bubbles line up in a strip to the right, off-screen until you pan sideways.
 */

const SPACING = 340;
const STRIP_GAP = 220;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export type Pt2 = { x: number; y: number };

export function spiral(slot: number): Pt2 {
  const r = SPACING * Math.sqrt(slot);
  return { x: r * Math.cos(slot * GOLDEN), y: r * Math.sin(slot * GOLDEN) };
}

export type Layout = {
  anchors: Map<number, Pt2>;
  /** radius of the focused cluster, used for the ring of people who aren't in any bubble */
  ringRadius: number;
  /** first slot is taken by "my" bubble; if I'm in none, slot 0 is left empty for me */
  centerOnMe: boolean;
};

export function computeLayout(focused: number[], unfocused: number[], myGroupId: number | null): Layout {
  const anchors = new Map<number, Pt2>();
  const ordered = [...focused].sort((a, b) => a - b);
  const mineFocused = myGroupId !== null && ordered.includes(myGroupId);
  if (mineFocused) ordered.splice(ordered.indexOf(myGroupId), 1);
  // Slot 0 (the center) is my bubble, or me on my own; everyone else spirals out from slot 1.
  if (mineFocused) anchors.set(myGroupId, { x: 0, y: 0 });
  ordered.forEach((id, i) => anchors.set(id, spiral(i + 1)));
  const slots = ordered.length + 1;
  const focusRadius = SPACING * Math.sqrt(Math.max(slots - 1, 1));
  const ringRadius = focusRadius + 200;

  const stripX = ringRadius + 360;
  [...unfocused]
    .sort((a, b) => a - b)
    .forEach((id, i) => anchors.set(id, { x: stripX + i * STRIP_GAP, y: (i % 2 ? 1 : -1) * 40 }));

  return { anchors, ringRadius, centerOnMe: !mineFocused };
}

export function ringPoint(id: string, radius: number): Pt2 {
  const angle = ((hashString(id) % 3600) / 3600) * Math.PI * 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** Render-time bob (does not touch physics). */
export function bob(phase: number, t: number, enabled: boolean) {
  if (!enabled) return { dx: 0, dy: 0 };
  return { dx: Math.cos(t / 1900 + phase) * 1.4, dy: Math.sin(t / 1400 + phase) * 2.6 };
}
