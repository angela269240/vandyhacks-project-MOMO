import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastRoom } from "@/lib/events";
import { groupFromParam, requireInRoom } from "@/lib/rooms";
import { notesSaveSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import type { GroupNotes } from "@/lib/types";

export const dynamic = "force-dynamic";

const EMPTY: GroupNotes = { content: "", version: 0, createdAt: "", updatedAt: "", expiresAt: "" };

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/groups/[name]/notes">) => {
  const group = await groupFromParam((await ctx.params).name);
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  return json((await getStore().getNotes(group.id, new Date())) ?? EMPTY);
});

/** Manual edit. 409 with the current notes if someone (or the AI) saved since the editor loaded them. */
export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/notes">) => {
  const userId = await requireUser(req);
  const { content, version } = notesSaveSchema.parse(await req.json());
  const group = await groupFromParam((await ctx.params).name);
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  await requireInRoom(userId, group);
  const store = getStore();
  const now = new Date();
  const saved = await store.saveNotes(group.id, content, version, now);
  if (!saved) {
    return json({ error: "The notes changed while you were editing", notes: (await store.getNotes(group.id, now)) ?? EMPTY }, { status: 409 });
  }
  await broadcastRoom(group.id, { type: "notes", payload: { version: saved.version } });
  return json(saved);
});
