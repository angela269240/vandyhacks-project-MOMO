import { CATEGORIES } from "../categories";
import type { Bookmark, Edge, GraphGroup, GraphUser } from "../types";

/**
 * Filter chips cycle: on (included) → off (unchecked) → exclude (✕) → none (no rule) → on.
 * - Excludes always win.
 * - While any chip is on/off, a bubble must match an "on" chip to pass.
 * - If every chip is "none" or "exclude", includes don't apply at all.
 */
export type ChipState = "on" | "off" | "exclude" | "none";

export const nextChipState: Record<ChipState, ChipState> = { on: "off", off: "exclude", exclude: "none", none: "on" };

export type Chip = { key: string; label: string; kind: "tag" | "bookmark"; groupIds?: Set<number> };

export function buildChips(bookmarks: Bookmark[]): Chip[] {
  return [
    ...bookmarks.map((b) => ({ key: `bookmark:${b.id}`, label: b.name, kind: "bookmark" as const, groupIds: new Set(b.groupIds) })),
    ...CATEGORIES.map((c) => ({ key: `tag:${c}`, label: c, kind: "tag" as const })),
  ];
}

const chipMatches = (chip: Chip, g: GraphGroup) =>
  chip.kind === "tag" ? g.category === chip.label : (chip.groupIds?.has(g.id) ?? false);

export const stateOf = (states: Record<string, ChipState>, key: string): ChipState => states[key] ?? "on";

export function passesChips(g: GraphGroup, chips: Chip[], states: Record<string, ChipState>) {
  let includeRules = false;
  let included = false;
  for (const chip of chips) {
    const s = stateOf(states, chip.key);
    const m = chipMatches(chip, g);
    if (s === "exclude" && m) return false;
    if (s === "on" || s === "off") includeRules = true;
    if (s === "on" && m) included = true;
  }
  return !includeRules || included;
}

export type SearchMatches = { groupIds: Set<number>; userIds: Set<string> };

/**
 * What the map highlights for a search: bubbles by name, tag or bookmark name, and people by name.
 * Null when the box is empty. Unlike the chips, search never hides anything; it only highlights and pulls matches in.
 */
export function searchMatches(query: string, groups: GraphGroup[], users: GraphUser[], bookmarks: Bookmark[]): SearchMatches | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const groupIds = new Set(
    groups
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          bookmarks.some((b) => b.groupIds.includes(g.id) && b.name.toLowerCase().includes(q)),
      )
      .map((g) => g.id),
  );
  const userIds = new Set(users.filter((u) => u.name.toLowerCase().includes(q)).map((u) => u.id));
  return { groupIds, userIds };
}

/** Everyone within `degrees` friendship hops of `me` (Infinity = everyone reachable or not). */
export function withinDegrees(meId: string, edges: Edge[], degrees: number): Set<string> | null {
  if (!Number.isFinite(degrees)) return null;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const seen = new Set([meId]);
  let frontier = [meId];
  for (let d = 0; d < degrees && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const o of adj.get(id) ?? []) {
        if (seen.has(o)) continue;
        seen.add(o);
        next.push(o);
      }
    }
    frontier = next;
  }
  return seen;
}
