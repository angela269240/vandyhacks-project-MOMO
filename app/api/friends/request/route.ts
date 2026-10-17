import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request) => {
  const from = await requireUser(req);
  const { to } = z.object({ to: z.string().min(1) }).parse(await req.json());
  if (to === from) return json({ error: "That's you" }, { status: 400 });
  const store = getStore();
  if (!(await store.getUser(to))) return json({ error: "User not found" }, { status: 404 });
  const status = await store.requestFriend(from, to);
  if (status === "pending") await broadcastLobby({ type: "friend_requested", payload: { from, to } });
  if (status === "accepted") await broadcastLobby({ type: "friend_accepted", payload: { a: from, b: to } });
  return json({ status });
});
