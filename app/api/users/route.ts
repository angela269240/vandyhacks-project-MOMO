import { randomUUID } from "node:crypto";
import { handle, json } from "@/lib/api";
import { hashKey, newDeviceKey } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { lingerMs } from "@/lib/time";
import { profileSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request) => {
  const input = profileSchema.parse(await req.json());
  const store = getStore();
  const id = randomUUID();
  const deviceKey = newDeviceKey();
  const user = await store.createUser(input, id, hashKey(deviceKey));

  // Demo touch: a couple of seeded classmates say hi, so the requests bell has something in it.
  if (process.env.DEMO_WELCOME_REQUESTS !== "0") {
    const graph = await store.getGraph(new Date(), lingerMs());
    const seeded = graph.users.filter((u) => u.id.startsWith("seed-") && u.inRoom);
    for (const s of seeded.sort(() => Math.random() - 0.5).slice(0, 2)) await store.requestFriend(s.id, id);
  }

  await broadcastLobby({ type: "user_created", payload: { userId: id } });
  return json({ user, deviceKey }, { status: 201 });
});
