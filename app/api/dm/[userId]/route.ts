import { randomUUID } from "node:crypto";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { chatSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

/** Only the two people in a direct chat can read it, so reads need the device key too. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/dm/[userId]">) => {
  const me = await requireUser(req);
  const { userId } = await ctx.params;
  if (userId === me) return json({ error: "That's you" }, { status: 400 });
  return json(await getStore().getDirectChat(me, userId, new Date()));
});

/** Persist first, then nudge the recipient; the lobby event carries no text, they fetch it. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/dm/[userId]">) => {
  const me = await requireUser(req);
  const { text } = chatSchema.parse(await req.json());
  const { userId } = await ctx.params;
  if (userId === me) return json({ error: "That's you" }, { status: 400 });
  const store = getStore();
  if (!(await store.getUser(userId))) return json({ error: "User not found" }, { status: 404 });
  const now = new Date();
  const message: ChatMessage = { id: randomUUID(), ts: now.toISOString(), userId: me, text };
  await store.appendDirectChat(me, userId, message, now);
  await broadcastLobby({ type: "dm", payload: { from: me, to: userId } });
  return json({ message }, { status: 201 });
});
