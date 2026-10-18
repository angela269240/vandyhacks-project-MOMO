import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { rateLimited } from "@/lib/rate-limit";
import { groupFromParam, requireInRoom } from "@/lib/rooms";
import { createSpeechSession, speechConfigured } from "@/lib/speech";

/** Realtime speech token for AI notetaking. One per stretch of talking, so the limit allows a lively conversation. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/notes/speech">) => {
  const userId = await requireUser(req);
  if (!speechConfigured()) return json({ error: "AI notetaking isn't set up here" }, { status: 503 });
  const group = await groupFromParam((await ctx.params).name);
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  await requireInRoom(userId, group);
  if (rateLimited(req, `notes-speech:${userId}`, 12)) return json({ error: "Too many speech sessions. Wait a minute." }, { status: 429 });
  return json(await createSpeechSession());
});
