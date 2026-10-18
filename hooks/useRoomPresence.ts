"use client";

import { useMemo } from "react";
import { useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import type { GraphUser } from "@/lib/types";

/**
 * Who is in a room right now, from the server's presence (users in the group with in_room = 1).
 * You're always included while you're in it, even before the graph catches up with your join.
 */
export function useRoomPresence(groupId: number | null, { includeMe = true }: { includeMe?: boolean } = {}) {
  const { data: graph } = useGraph();
  const { me } = useMe();

  return useMemo(() => {
    if (groupId === null) return [] as GraphUser[];
    const list = (graph?.users ?? []).filter((u) => u.groupId === groupId && u.inRoom && u.id !== me?.id);
    if (includeMe && me) {
      const fromGraph = graph?.users.find((u) => u.id === me.id);
      list.push({ ...(fromGraph ?? { away: false }), ...me, groupId, inRoom: true, away: false } as GraphUser);
    }
    return list.sort((a, b) => a.id.localeCompare(b.id));
  }, [graph, groupId, me, includeMe]);
}
