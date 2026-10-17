import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { colorForName } from "@/lib/colors";
import { broadcastLobby } from "@/lib/events";
import { groupNameSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const name = groupNameSchema.parse((await req.json()).name);
  const group = await getStore().createGroup(name, colorForName(name), userId);
  if (!group) return json({ error: "Name taken" }, { status: 409 });
  await broadcastLobby({ type: "group_created", payload: { groupId: group.id } });
  return json(group, { status: 201 });
});
