import { handle, json } from "@/lib/api";
import { broadcastLobby } from "@/lib/events";
import { archiveJson } from "@/lib/storage";
import { getStore } from "@/lib/store";
import { lingerMs } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron (daily; see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Archives and deletes groups that have been empty for the linger window, and deletes notes files past 60 days.
 * Notes are never archived: they go with their room, or at 60 days, whichever comes first.
 */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = getStore();
  const now = new Date();

  const expired = await store.expireGroups(now, lingerMs());
  for (const { group, chat } of expired) {
    const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await archiveJson(`chat-archive/${slug}-${group.id}/${now.toISOString().slice(0, 10)}.json`, { group, chat });
    await broadcastLobby({ type: "group_expired", payload: { groupId: group.id } });
  }

  const notesExpired = await store.expireNotes(now);

  return json({ expired: expired.map((e) => e.group.name), notesExpired });
});
