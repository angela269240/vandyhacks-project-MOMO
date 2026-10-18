import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

/**
 * Screen-share arbitration: one sharer per room. The client claims before opening the browser picker
 * and releases when it stops; leaving the room (or the LiveKit webhook) releases it too.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/screen">) => {
  const userId = await requireUser(req);
  const { sharing } = z.object({ sharing: z.boolean() }).parse(await req.json());
  const { name } = await ctx.params;
  const store = getStore();
  const group = await store.getGroupByName(decodeURIComponent(name));
  if (!group) return json({ error: "Group not found" }, { status: 404 });

  if (!sharing) {
    await store.releaseScreen(userId, group.id);
    return json({ sharerId: null });
  }
  const user = await store.getUser(userId);
  if (user?.currentGroupId !== group.id || !user.inRoom) return json({ error: "Join the room first" }, { status: 403 });
  const { granted, sharerId } = await store.claimScreen(userId, group.id);
  if (!granted) return json({ error: "Someone is already sharing", sharerId }, { status: 409 });
  return json({ sharerId });
});
