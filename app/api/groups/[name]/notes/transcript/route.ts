import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastRoom } from "@/lib/events";
import { genaiConfigured } from "@/lib/genai";
import { rateLimited } from "@/lib/rate-limit";
import { noteLines } from "@/lib/room-ai";
import { groupFromParam, requireInRoom } from "@/lib/rooms";
import { transcriptSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

/**
 * AI notetaking: classifies a stretch of transcribed speech and files what qualifies, scheduled events at the
 * top of the notes and topic facts at the bottom. The transcript itself is never stored or logged.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/notes/transcript">) => {
  const userId = await requireUser(req);
  const { text, timeZone } = transcriptSchema.parse(await req.json());
  if (!genaiConfigured()) return json({ error: "AI notetaking isn't set up here" }, { status: 503 });
  const group = await groupFromParam((await ctx.params).name);
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  await requireInRoom(userId, group);
  if (rateLimited(req, `notes-ai:${userId}`, 20)) return json({ error: "Slow down a little" }, { status: 429 });

  const store = getStore();
  const now = new Date();
  const existing = (await store.getNotes(group.id, now))?.content ?? "";
  let lines;
  try {
    lines = await noteLines(group, text, existing, now, timeZone ?? "UTC");
  } catch (e) {
    console.error("[notes] GenAI failed", (e as Error).message); // not the transcript
    return json({ error: "Couldn't take notes just now" }, { status: 502 });
  }
  let notes = null;
  if (lines.events.length) notes = await store.addNotes(group.id, lines.events, "start", now);
  if (lines.topics.length) notes = await store.addNotes(group.id, lines.topics, "end", now);
  if (notes) await broadcastRoom(group.id, { type: "notes", payload: { version: notes.version } });
  return json({ added: lines.events.length + lines.topics.length, version: notes?.version ?? null });
});
