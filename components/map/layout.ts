import { hashString } from "@/lib/colors";

/**
 * World-space layout for the map.
 * Focused bubbles sit on a phyllotaxis spiral around the origin, with your current bubble (and you) at the center.
 * Unfocused bubbles line up in a strip to the right, off-screen until you pan sideways.
 */

const SPACING = 340;
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

/**
 * On-screen radius of a bubble with n people (world units): people loosely packed at the map's collide
 * spacing (~120 apart, so ~70·√n across) plus a close-fitting outline. The map draws bubbles at least this big.
 */
export const BUBBLE_PADDING = 32;
export const clusterRadius = (n: number, scale = 1) => (62 + 70 * Math.sqrt(Math.max(n, 1))) * scale;

/**
 * Places bubbles along a golden-angle spiral, pushing each one outward until it clears every bubble
 * already placed, so a 40-person bubble gets the room it needs without spreading out the small ones.
 */
export function computeLayout(
  focused: number[],
  unfocused: number[],
  myGroupId: number | null,
  sizes: Map<number, number> = new Map(),
  unfocusedScale = 0.55,
): Layout {
  const anchors = new Map<number, Pt2>();
  const placed: { p: Pt2; r: number }[] = [];
  const GAP = 140; // leaves room for the two label lines above each bubble
  const clear = (p: Pt2, r: number) => placed.every((o) => Math.hypot(p.x - o.p.x, p.y - o.p.y) >= r + o.r + GAP);

  const ordered = [...focused].sort((a, b) => a - b);
  const mineFocused = myGroupId !== null && ordered.includes(myGroupId);
  if (mineFocused) ordered.splice(ordered.indexOf(myGroupId), 1);
  // Slot 0 (the center) is my bubble, or me on my own; everyone else spirals out around it.
  const centerR = mineFocused ? clusterRadius(sizes.get(myGroupId) ?? 1) : 40;
  if (mineFocused) anchors.set(myGroupId, { x: 0, y: 0 });
  placed.push({ p: { x: 0, y: 0 }, r: centerR });

  ordered.forEach((id, i) => {
    const r = clusterRadius(sizes.get(id) ?? 1);
    const angle = (i + 1) * GOLDEN;
    let dist = centerR + r + GAP;
    let p = { x: dist * Math.cos(angle), y: dist * Math.sin(angle) };
    while (!clear(p, r)) {
      dist += 20;
      p = { x: dist * Math.cos(angle), y: dist * Math.sin(angle) };
    }
    anchors.set(id, p);
    placed.push({ p, r });
  });

  const extent = Math.max(...placed.map((o) => Math.hypot(o.p.x, o.p.y) + o.r));
  const ringRadius = extent + 160;

  // Unfocused bubbles line up in a strip to the right, off-screen until you pan sideways.
  let x = ringRadius + 360;
  [...unfocused]
    .sort((a, b) => a - b)
    .forEach((id, i) => {
      const r = clusterRadius(sizes.get(id) ?? 1, unfocusedScale);
      x += r;
      anchors.set(id, { x, y: (i % 2 ? 1 : -1) * 40 });
      x += r + 60;
    });

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
