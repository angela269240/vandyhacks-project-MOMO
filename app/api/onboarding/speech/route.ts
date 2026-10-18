import { handle, json } from "@/lib/api";
import { createSpeechSession, speechConfigured } from "@/lib/speech";
import { rateLimited } from "@/lib/rate-limit";

/** Realtime speech token for the welcome screen. Called before the profile exists, so it's limited per IP instead. */
export const POST = handle(async (req: Request) => {
  if (!speechConfigured()) return json({ error: "Voice intro isn't set up here" }, { status: 503 });
  if (rateLimited(req, "speech", 6)) return json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  return json(await createSpeechSession());
});
