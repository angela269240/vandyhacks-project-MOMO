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

export const LAYOUT_GAP = 140; // leaves room for the two label lines above each bubble

/** Room a label needs on the map, in world units (the caller sizes it for the zoom the map will be viewed at). */
export type LabelBox = { w: number; h: number };
/** what sits at the center when you're in no bubble: your circle, and your name under it */
export type CenterMark = { r: number; label: LabelBox };

/** clear space kept around label boxes, in world units */
const LABEL_GAP = 24;
type Box = { x0: number; y0: number; x1: number; y1: number };
/** a bubble (or you) on the layout: its circle plus the label boxes drawn next to it */
type Footprint = { p: Pt2; r: number; boxes: Box[] };

const above = (p: Pt2, r: number, l: LabelBox): Box => ({ x0: p.x - l.w / 2, x1: p.x + l.w / 2, y0: p.y - r - l.h, y1: p.y - r });
const below = (p: Pt2, r: number, l: LabelBox): Box => ({ x0: p.x - l.w / 2, x1: p.x + l.w / 2, y0: p.y + r, y1: p.y + r + l.h });
const distToBox = (p: Pt2, b: Box) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
const boxesApart = (a: Box, b: Box) =>
  a.x1 + LABEL_GAP <= b.x0 || b.x1 + LABEL_GAP <= a.x0 || a.y1 + LABEL_GAP <= b.y0 || b.y1 + LABEL_GAP <= a.y0;

/** Two footprints don't touch: circles keep LAYOUT_GAP apart, and no label runs into the other bubble or its label. */
export function footprintsApart(a: Footprint, b: Footprint): boolean {
  if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < a.r + b.r + LAYOUT_GAP) return false;
  if (b.boxes.some((box) => distToBox(a.p, box) < a.r + LABEL_GAP)) return false;
  if (a.boxes.some((box) => distToBox(b.p, box) < b.r + LABEL_GAP)) return false;
  return a.boxes.every((x) => b.boxes.every((y) => boxesApart(x, y)));
}
/** farthest any part of a footprint reaches from the origin */
const reach = (f: Footprint) =>
  Math.max(
    Math.hypot(f.p.x, f.p.y) + f.r,
    ...f.boxes.flatMap((b) => [Math.hypot(b.x0, b.y0), Math.hypot(b.x1, b.y0), Math.hypot(b.x0, b.y1), Math.hypot(b.x1, b.y1)]),
  );

/**
 * Places bubbles along a golden-angle spiral, pushing each one outward until it clears every bubble
 * already placed, so a 40-person bubble gets the room it needs without spreading out the small ones.
 * `priority` bubbles (search matches) take the middle: the first one sits at the center, the rest spiral out first.
 * `labels` reserves room for each bubble's name above it, and `me` for you (and your name) at the center when
 * you're in no bubble, so no bubble lands on a label, on you, or on the people in no bubble around the outside.
 */
export function computeLayout(
  focused: number[],
  unfocused: number[],
  myGroupId: number | null,
  sizes: Map<number, number> = new Map(),
  unfocusedScale = 0.55,
  priority: number[] = [],
  labels: Map<number, LabelBox> = new Map(),
  me: CenterMark = { r: 40, label: { w: 0, h: 0 } },
): Layout {
  const anchors = new Map<number, Pt2>();
  const placed: Footprint[] = [];
  const footprint = (id: number, p: Pt2, r: number): Footprint => {
    const l = labels.get(id);
    return { p, r, boxes: l ? [above(p, r, l)] : [] };
  };
  const clear = (f: Footprint) => placed.every((o) => footprintsApart(f, o));

  const first = priority.filter((id) => focused.includes(id)).sort((a, b) => a - b);
  const rest = focused.filter((id) => !first.includes(id)).sort((a, b) => a - b);
  const ordered = [...first, ...rest];
  const centerId = first[0] ?? (myGroupId !== null && ordered.includes(myGroupId) ? myGroupId : null);
  if (centerId !== null) ordered.splice(ordered.indexOf(centerId), 1);
  // Slot 0 (the center) is my bubble (or the best search match), or me on my own; everyone else spirals out around it.
  const origin = { x: 0, y: 0 };
  const centerR = centerId !== null ? clusterRadius(sizes.get(centerId) ?? 1) : me.r;
  if (centerId !== null) {
    anchors.set(centerId, origin);
    placed.push(footprint(centerId, origin, centerR));
  } else {
    placed.push({ p: origin, r: me.r, boxes: me.label.w ? [below(origin, me.r, me.label)] : [] });
  }

  ordered.forEach((id, i) => {
    const r = clusterRadius(sizes.get(id) ?? 1);
    const angle = (i + 1) * GOLDEN;
    let dist = centerR + r + LAYOUT_GAP;
    let f = footprint(id, { x: dist * Math.cos(angle), y: dist * Math.sin(angle) }, r);
    while (!clear(f)) {
      dist += 20;
      f = footprint(id, { x: dist * Math.cos(angle), y: dist * Math.sin(angle) }, r);
    }
    anchors.set(id, f.p);
    placed.push(f);
  });

  // People in no bubble circle the whole cluster, labels included, with room to spare.
  const extent = Math.max(...placed.map(reach));
  const ringRadius = extent + 160;

  // Unfocused bubbles line up in a strip to the right, off-screen until you pan sideways.
  let x = ringRadius + 360;
  [...unfocused]
    .sort((a, b) => a - b)
    .forEach((id, i) => {
      // a long name is wider than its small bubble, so the label sets the spacing
      const half = Math.max(clusterRadius(sizes.get(id) ?? 1, unfocusedScale), (labels.get(id)?.w ?? 0) / 2);
      x += half;
      anchors.set(id, { x, y: (i % 2 ? 1 : -1) * 40 });
      x += half + 60;
    });

  return { anchors, ringRadius, centerOnMe: centerId === null };
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
