import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/join">) => {
  const userId = await requireUser(req);
  const { name } = await ctx.params;
  const store = getStore();
  const group = await store.getGroupByName(decodeURIComponent(name));
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  const { fromGroupId } = await store.joinGroup(userId, group.id, new Date());
  await broadcastLobby({ type: "user_moved", payload: { userId, groupId: group.id, fromGroupId } });
  return json(group);
});
