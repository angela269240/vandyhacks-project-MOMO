import { randomUUID } from "node:crypto";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { LOBBY_ROOM, createToken, groupRoom, livekitConfigured } from "@/lib/livekit";
import { getStore } from "@/lib/store";

/**
 * Lobby: anyone (even before creating a profile) can listen, data only.
 * Group room: must be the signed-in user and currently in that group; can publish mic and screen.
 */
export const POST = handle(async (req: Request) => {
  if (!livekitConfigured()) return json({ error: "LiveKit not configured" }, { status: 503 });
  const { room } = z.object({ room: z.string().min(1) }).parse(await req.json());

  if (room === LOBBY_ROOM) {
    const token = await createToken({ room, identity: `lobby-${randomUUID()}`, name: "lobby", publish: false });
    return json({ token, room });
  }

  const userId = await requireUser(req);
  const store = getStore();
  const [user, group] = await Promise.all([store.getUser(userId), store.getGroupByName(room)]);
  if (!user || !group) return json({ error: "Not found" }, { status: 404 });
  if (user.currentGroupId !== group.id) return json({ error: "Join the group first" }, { status: 403 });
  const lkRoom = groupRoom(group.id);
  const token = await createToken({ room: lkRoom, identity: userId, name: user.name, publish: true });
  return json({ token, room: lkRoom });
});
