import { handle, json } from "@/lib/api";
import { runModeration } from "@/lib/moderation";

export const dynamic = "force-dynamic";
/** One model call per ~12k characters of the day's text. */
export const maxDuration = 300;

/**
 * Vercel Cron, end of each day (see vercel.json; 04:00 UTC is 11 PM in Nashville, before expire-groups at 09:00
 * deletes emptied rooms and their chat). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json(await runModeration());
});
