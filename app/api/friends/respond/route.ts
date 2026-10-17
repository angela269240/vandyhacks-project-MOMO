import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req);
  const { other, accept } = z.object({ other: z.string().min(1), accept: z.boolean() }).parse(await req.json());
  const ok = await getStore().respondFriend(me, other, accept);
  if (!ok) return json({ error: "No pending request" }, { status: 404 });
  if (accept) await broadcastLobby({ type: "friend_accepted", payload: { a: me, b: other } });
  return json({ ok });
});
