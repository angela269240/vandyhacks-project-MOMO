/**
 * Bounded camera math for the map. Pure functions, no DOM, so they can be tested on their own.
 *
 * The map uses d3-zoom's convention (top-left origin, CSS pixels): screen = world * k + t.
 * `t` is the camera translation; the graph's world coordinates never change because of the camera.
 *
 * The rule: whichever way you pan, the outermost node may come as far as the viewport's centerline and no
 * farther, so the network can never leave the screen. On an axis where the whole graph already fits on
 * screen, there is nothing to explore: the camera is locked with the graph centered on that axis.
 */

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
/** d3-zoom transform: screen = world * k + (x, y) */
export type Translate = { x: number; y: number; k: number };
export type PanBounds = { minPanX: number; maxPanX: number; minPanY: number; maxPanY: number };
export type Viewport = { width: number; height: number };

/** World-space extent of the given points; null when none have coordinates yet. */
export function getGraphBounds(points: Iterable<{ x?: number; y?: number }>): Bounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x!);
    maxX = Math.max(maxX, p.x!);
    minY = Math.min(minY, p.y!);
    maxY = Math.max(maxY, p.y!);
  }
  return minX === Infinity ? null : { minX, maxX, minY, maxY };
}

/**
 * The range the translation may take at zoom k.
 * minPan*: graph moved as far left/up as allowed (its right/bottom-most node sits on the centerline);
 * maxPan*: as far right/down as allowed (its left/top-most node sits on the centerline).
 * `margin` (screen px) is how much bigger than the graph's node span the viewport may be before the axis
 * counts as "fits" and locks centered (room for the node discs and a little air around them).
 */
export function getCameraPanBounds(b: Bounds, k: number, view: Viewport, margin = 0): PanBounds {
  const axis = (min: number, max: number, size: number): [number, number] => {
    if ((max - min) * k + margin <= size) {
      const centered = size / 2 - ((min + max) / 2) * k;
      return [centered, centered];
    }
    return [size / 2 - max * k, size / 2 - min * k];
  };
  const [minPanX, maxPanX] = axis(b.minX, b.maxX, view.width);
  const [minPanY, maxPanY] = axis(b.minY, b.maxY, view.height);
  return { minPanX, maxPanX, minPanY, maxPanY };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Clamp each axis on its own, so hitting one limit never freezes the other. */
export function clampCameraPosition(t: Translate, pb: PanBounds): Translate {
  return { x: clamp(t.x, pb.minPanX, pb.maxPanX), y: clamp(t.y, pb.minPanY, pb.maxPanY), k: t.k };
}

/** A drag moves the camera 1:1 with the pointer (screen pixels), then the limits apply. */
export function applyDragDelta(start: Translate, dx: number, dy: number, pb: PanBounds | null): Translate {
  const next = { x: start.x + dx, y: start.y + dy, k: start.k };
  return pb ? clampCameraPosition(next, pb) : next;
}

/** force-graph's camera API speaks in "world point at the viewport center"; convert both ways. */
export const centerToTranslate = (c: { x: number; y: number }, k: number, view: Viewport): Translate => ({
  x: view.width / 2 - c.x * k,
  y: view.height / 2 - c.y * k,
  k,
});
export const translateToCenter = (t: Translate, view: Viewport) => ({
  x: (view.width / 2 - t.x) / t.k,
  y: (view.height / 2 - t.y) / t.k,
});

/**
 * Ease stored bounds toward freshly measured ones, so the limits follow the layout (people arriving, bubbles
 * moving) without trembling with every tick of the force simulation. Returns the same object when unchanged.
 */
export function smoothBounds(prev: Bounds | null, next: Bounds | null, ease: number): Bounds | null {
  if (!next || !prev) return next;
  const step = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * ease);
  const out = {
    minX: step(prev.minX, next.minX),
    maxX: step(prev.maxX, next.maxX),
    minY: step(prev.minY, next.minY),
    maxY: step(prev.maxY, next.maxY),
  };
  return out.minX === prev.minX && out.maxX === prev.maxX && out.minY === prev.minY && out.maxY === prev.maxY
    ? prev
    : out;
}
