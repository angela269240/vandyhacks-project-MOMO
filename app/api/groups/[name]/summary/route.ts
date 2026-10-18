import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { genaiConfigured } from "@/lib/genai";
import { rateLimited } from "@/lib/rate-limit";
import { summarizeChat } from "@/lib/room-ai";
import { groupFromParam, requireInRoom } from "@/lib/rooms";
import { getStore } from "@/lib/store";

const SUMMARY_MESSAGES = 100;

/** AI summary of the room's last 100 messages, on demand. Not stored. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/groups/[name]/summary">) => {
  const userId = await requireUser(req);
  if (!genaiConfigured()) return json({ error: "AI summaries aren't set up here" }, { status: 503 });
  const group = await groupFromParam((await ctx.params).name);
  if (!group) return json({ error: "Group not found" }, { status: 404 });
  await requireInRoom(userId, group);
  if (rateLimited(req, `summary:${userId}`, 5)) return json({ error: "Wait a minute before summarizing again" }, { status: 429 });

  const store = getStore();
  const hours = await store.getChat(group.id, 24 * 7);
  const messages = hours.flatMap((h) => h.messages).slice(-SUMMARY_MESSAGES);
  if (messages.length === 0) return json({ summary: null, count: 0 });

  const names = new Map<string, string>();
  for (const id of new Set(messages.map((m) => m.userId))) {
    names.set(id, (await store.getUser(id))?.name.split(" ")[0] ?? "Someone");
  }
  try {
    const summary = await summarizeChat(
      group,
      messages.map((m) => ({ name: names.get(m.userId)!, ts: m.ts, text: m.text })),
    );
    return json({ summary, count: messages.length });
  } catch (e) {
    console.error("[summary] GenAI failed", (e as Error).message);
    return json({ error: "Couldn't summarize right now" }, { status: 502 });
  }
});
