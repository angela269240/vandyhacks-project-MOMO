"use client";

import { useMemo } from "react";
import { useGraph } from "@/hooks/useGraph";

export type RoomEdge = { key: string; a: string; b: string };

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Friendship lines inside a room: an edge only when the friendship is accepted (the graph API returns
 * accepted friendships only) and both people are in the room. Never inferred from sharing a group.
 */
export function useRoomFriendships(memberIds: string[]) {
  const { data: graph } = useGraph();
  const idsKey = [...memberIds].sort().join(",");

  return useMemo(() => {
    const present = new Set(idsKey ? idsKey.split(",") : []);
    const edges = new Map<string, RoomEdge>();
    /** id -> friend ids, across the whole graph (used for mutual friends) */
    const friendsOf = new Map<string, Set<string>>();
    for (const e of graph?.edges ?? []) {
      if (!friendsOf.has(e.source)) friendsOf.set(e.source, new Set());
      if (!friendsOf.has(e.target)) friendsOf.set(e.target, new Set());
      friendsOf.get(e.source)!.add(e.target);
      friendsOf.get(e.target)!.add(e.source);
      if (e.source === e.target || !present.has(e.source) || !present.has(e.target)) continue;
      const key = pairKey(e.source, e.target);
      if (!edges.has(key)) edges.set(key, { key, a: e.source, b: e.target });
    }
    return { edges: [...edges.values()], friendsOf };
  }, [graph?.edges, idsKey]);
}
