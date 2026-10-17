import type { Graph, Group, User } from "../types";

/**
 * Applies the visibility rules shared by both stores:
 * - a group is visible while it has active members, or for the linger window after its last exit
 * - a user sits in their group while in the room, or "away" within the linger window after leaving
 */
export function buildGraph(
  users: User[],
  groups: Group[],
  friendships: { a: string; b: string }[],
  now: Date,
  lingerMs: number,
): Graph {
  const cutoff = now.getTime() - lingerMs;
  const active = new Map<number, number>();
  for (const u of users) {
    if (u.currentGroupId !== null && u.inRoom) active.set(u.currentGroupId, (active.get(u.currentGroupId) ?? 0) + 1);
  }

  const visibleGroups = groups
    .filter((g) => (active.get(g.id) ?? 0) > 0 || (g.lastExitAt ? new Date(g.lastExitAt).getTime() > cutoff : true))
    .map((g) => ({ ...g, activeCount: active.get(g.id) ?? 0 }));
  const visibleIds = new Set(visibleGroups.map((g) => g.id));

  const graphUsers = users.map((u) => {
    const recentlyLeft = u.leftGroupAt !== null && new Date(u.leftGroupAt).getTime() > cutoff;
    const placed = u.currentGroupId !== null && visibleIds.has(u.currentGroupId) && (u.inRoom || recentlyLeft);
    return {
      id: u.id,
      name: u.name,
      linkedin: u.linkedin,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      interestIds: u.interestIds,
      groupId: placed ? u.currentGroupId : null,
      inRoom: placed && u.inRoom,
      away: placed && !u.inRoom,
    };
  });

  return {
    users: graphUsers,
    groups: visibleGroups,
    edges: friendships.map((f) => ({ source: f.a, target: f.b })),
  };
}
