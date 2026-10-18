import "server-only";
import { getStore } from "./store";
import type { Group } from "./types";

export class RoomAccessError extends Error {}

/** The group for a route's [name] segment, or null. */
export async function groupFromParam(name: string) {
  return getStore().getGroupByName(decodeURIComponent(name));
}

/** Notes and room AI are for people currently in the room. */
export async function requireInRoom(userId: string, group: Group) {
  const user = await getStore().getUser(userId);
  if (!user || user.currentGroupId !== group.id || !user.inRoom) throw new RoomAccessError("Join the room first");
}
