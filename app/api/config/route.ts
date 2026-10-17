import { json } from "@/lib/api";
import { livekitConfigured } from "@/lib/livekit";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Tells the client which realtime transport to use and where data lives. */
export async function GET() {
  return json({
    realtime: livekitConfigured() ? "livekit" : "sse",
    livekitUrl: livekitConfigured() ? process.env.LIVEKIT_URL : null,
    store: getStore().kind,
  });
}
