import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { getStore } from "@/lib/store";

/**
 * Leaves the room (keeps the group for the linger window).
 * Also accepts identity in the body, because navigator.sendBeacon (tab close) can't set headers.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/leave">) => {
  const body = await req.json().catch(() => ({}));
  const userId = await requireUser(req, body);
  const { name } = await ctx.params;
  const store = getStore();
  const group = await store.getGroupByName(decodeURIComponent(name));
  if (!group) return json({ ok: false }, { status: 404 });
  if (await store.leaveRoom(userId, group.id, new Date())) {
    await broadcastLobby({ type: "user_left_room", payload: { userId, groupId: group.id } });
  }
  return json({ ok: true });
});
