import "server-only";
import { AccessToken, DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";

export const LOBBY_ROOM = "lobby";
export const groupRoom = (groupId: number) => `g-${groupId}`;

export const livekitConfigured = () =>
  Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

let client: RoomServiceClient | null = null;
function roomService() {
  client ??= new RoomServiceClient(
    process.env.LIVEKIT_URL!.replace(/^wss?:/, "https:"),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );
  return client;
}

export async function createToken(opts: { room: string; identity: string; name: string; publish: boolean }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: opts.identity,
    name: opts.name,
    ttl: "6h",
  });
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: opts.publish,
    canSubscribe: true,
    canPublishData: false,
  });
  return at.toJwt();
}

/** Server-authoritative data message to everyone in a room. A room with nobody in it doesn't exist yet, which is fine. */
export async function sendRoomData(room: string, payload: unknown) {
  try {
    await roomService().sendData(room, new TextEncoder().encode(JSON.stringify(payload)), DataPacket_Kind.RELIABLE, {
      topic: "events",
    });
  } catch {
    // no participants → room not created; nothing to deliver
  }
}
