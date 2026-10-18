import { json } from "@/lib/api";
import { genaiConfigured } from "@/lib/genai";
import { livekitConfigured } from "@/lib/livekit";
import { speechConfigured } from "@/lib/speech";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Tells the client which realtime transport to use and where data lives. */
export async function GET() {
  return json({
    realtime: livekitConfigured() ? "livekit" : "sse",
    livekitUrl: livekitConfigured() ? process.env.LIVEKIT_URL : null,
    store: getStore().kind,
    /** AI notetaking needs both: speech to transcribe, GenAI to pick out notes. Summaries need GenAI. */
    ai: { notes: speechConfigured() && genaiConfigured(), summary: genaiConfigured() },
  });
}
