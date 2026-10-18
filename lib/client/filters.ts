import type { Bookmark, Edge, GraphGroup, GraphUser } from "../types";

/**
 * Tag filters: every bubble has exactly one category tag. A bubble is shown unless its tag is unchecked.
 * A bookmark can additionally narrow the map to just its bubbles.
 */
export function passesFilters(g: GraphGroup, uncheckedTags: Set<string>, bookmark: Bookmark | null) {
  if (uncheckedTags.has(g.category)) return false;
  return !bookmark || bookmark.groupIds.includes(g.id);
}

export type SearchMatches = { groupIds: Set<number>; userIds: Set<string> };

/**
 * What the map highlights for a search: bubbles and people by name only.
 * Null when the box is empty. Search never hides anything; it only highlights and pulls matches in.
 */
export function searchMatches(query: string, groups: GraphGroup[], users: GraphUser[]): SearchMatches | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return {
    groupIds: new Set(groups.filter((g) => g.name.toLowerCase().includes(q)).map((g) => g.id)),
    userIds: new Set(users.filter((u) => u.name.toLowerCase().includes(q)).map((u) => u.id)),
  };
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
