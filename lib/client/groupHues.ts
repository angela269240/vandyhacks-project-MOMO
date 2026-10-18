"use client";

import { useSyncExternalStore } from "react";
import { HUES, hueSimilarity, hueVar, preferredHue, type HueKey } from "@/lib/colors";

/**
 * Which palette hue each bubble is drawn in. Purely visual: nothing here is stored.
 * The map assigns hues from the current layout so neighboring bubbles look clearly different,
 * and every surface that shows a bubble's color (blob, member nodes, room header, lists) reads it from here.
 */

type Pt = { x: number; y: number };

/** spiral neighbors sit ~340 apart; the whole focused cluster (~1000 across) reads as one scene, so reach wide */
const REACH = 900;
/** cost of leaving a bubble's current (or preferred) hue: keeps colors steady as filters change */
const STICKY = 0.6;

export function assignGroupHues(
  groups: { id: number; name: string }[],
  anchors: Map<number, Pt>,
  previous: Map<number, HueKey>,
): Map<number, HueKey> {
  const placed = groups
    .map((g) => ({ g, at: anchors.get(g.id) ?? null }))
    // center of the map first: the bubbles you see first get the cleanest separation
    .sort((a, b) => dist(a.at) - dist(b.at) || a.g.id - b.g.id);

  const out = new Map<number, HueKey>();
  const done: { at: Pt | null; hue: HueKey }[] = [];
  const uses = new Map<HueKey, number>();
  for (const { g, at } of placed) {
    const want = previous.get(g.id) ?? preferredHue(g.name);
    let best: HueKey = want;
    let bestCost = Infinity;
    for (const { key } of HUES) {
      let cost = key === want ? 0 : STICKY;
      if (at) {
        for (const o of done) {
          if (!o.at) continue;
          const d = Math.hypot(at.x - o.at.x, at.y - o.at.y);
          cost += Math.exp(-((d / REACH) ** 2)) * hueSimilarity(key, o.hue);
        }
      }
      cost += (uses.get(key) ?? 0) * 0.45; // use the whole palette before repeating a hue
      if (cost < bestCost) {
        bestCost = cost;
        best = key;
      }
    }
    out.set(g.id, best);
    done.push({ at, hue: best });
    uses.set(best, (uses.get(best) ?? 0) + 1);
  }
  return out;
}

const dist = (p: Pt | null) => (p ? Math.hypot(p.x, p.y) : Infinity);

// ---- tiny external store shared by the map canvas and the DOM ----

let current = new Map<number, HueKey>();
const listeners = new Set<() => void>();

export const groupHues = {
  get: () => current,
  set(next: Map<number, HueKey>) {
    const same = next.size === current.size && [...next].every(([id, h]) => current.get(id) === h);
    if (same) return;
    current = next;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};

export function groupHue(group: { id: number; name: string }, hues = current): HueKey {
  return hues.get(group.id) ?? preferredHue(group.name);
}

/** Re-renders when the map reassigns colors; returns a theme-following CSS color per group. */
export function useGroupColor(): (group: { id: number; name: string }) => string {
  const hues = useSyncExternalStore(groupHues.subscribe, groupHues.get, groupHues.get);
  return (group) => hueVar(groupHue(group, hues));
}
