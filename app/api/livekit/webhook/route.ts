import { WebhookReceiver } from "livekit-server-sdk";
import { broadcastLobby } from "@/lib/events";
import { livekitConfigured } from "@/lib/livekit";
import { getStore } from "@/lib/store";

/** Covers closed tabs and dropped connections: a participant leaving a group room leaves the group's room in the DB. */
export async function POST(req: Request) {
  if (!livekitConfigured()) return new Response(null, { status: 503 });
  const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  let event;
  try {
    event = await receiver.receive(await req.text(), req.headers.get("authorization") ?? undefined);
  } catch {
    return new Response(null, { status: 401 });
  }

  const match = event.room?.name.match(/^g-(\d+)$/);
  if (event.event === "participant_left" && match && event.participant) {
    const groupId = Number(match[1]);
    const userId = event.participant.identity;
    if (await getStore().leaveRoom(userId, groupId, new Date())) {
      await broadcastLobby({ type: "user_left_room", payload: { userId, groupId } });
    }
  }
  return new Response(null, { status: 200 });
}
