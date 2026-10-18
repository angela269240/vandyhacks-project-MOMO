import { z } from "zod";
import { handle, json } from "@/lib/api";
import { suggestProfile } from "@/lib/onboarding";
import { rateLimited } from "@/lib/rate-limit";

const bodySchema = z.object({ transcript: z.string().trim().min(1, "Say a little about yourself first").max(4000) });

/** Turns the transcribed intro into suggested interests and a bio (one GenAI call at most). */
export const POST = handle(async (req: Request) => {
  if (rateLimited(req, "suggest", 6)) return json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const { transcript } = bodySchema.parse(await req.json());
  return json(await suggestProfile(transcript));
});
