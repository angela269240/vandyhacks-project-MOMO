import { handle, json } from "@/lib/api";
import { broadcastLobby } from "@/lib/events";
import { summarizeHour } from "@/lib/genai";
import { archiveJson } from "@/lib/storage";
import { getStore } from "@/lib/store";
import { hourStart, vacancyMs } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron (hourly; see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * 1. Recaps every finished hour bucket with ≥5 messages (OCI GenAI, placeholder for now).
 * 2. Archives and deletes groups whose room has been empty for the vacancy window (30 days).
 */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = getStore();
  const now = new Date();

  let summarized = 0;
  for (const { groupId, hour } of await store.listUnsummarizedHours(hourStart(now), 5)) {
    const summary = await summarizeHour(hour.messages);
    if (summary) {
      await store.setSummary(groupId, hour.hourStart, summary);
      summarized++;
    }
  }

  const expired = await store.expireGroups(now, vacancyMs());
  for (const { group, chat } of expired) {
    const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await archiveJson(`chat-archive/${slug}-${group.id}/${now.toISOString().slice(0, 10)}.json`, { group, chat });
    await broadcastLobby({ type: "group_expired", payload: { groupId: group.id } });
  }

  return json({ summarized, expired: expired.map((e) => e.group.name) });
});
