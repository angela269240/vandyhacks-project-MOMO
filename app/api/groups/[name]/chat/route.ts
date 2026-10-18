import { randomUUID } from "node:crypto";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastRoom } from "@/lib/events";
import { chatSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { hourStart } from "@/lib/time";
import type { ChatMessage } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/groups/[name]/chat">) => {
  const { name } = await ctx.params;
  const store = getStore();
  const group = await store.getGroupByName(decodeURIComponent(name));
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  return json(await store.getChat(group.id, 24));
});

/** Persist first, then fan out, so what people see live is exactly what's stored. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/chat">) => {
  const userId = await requireUser(req);
  const { text } = chatSchema.parse(await req.json());
  const { name } = await ctx.params;
  const store = getStore();
  const group = await store.getGroupByName(decodeURIComponent(name));
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  const now = new Date();
  const message: ChatMessage = { id: randomUUID(), ts: now.toISOString(), userId, text };
  const hour = hourStart(now);
  await store.appendChat(group.id, message, hour);
  await broadcastRoom(group.id, { type: "chat", payload: { hourStart: hour, message } });
  return json({ hourStart: hour, message }, { status: 201 });
});
