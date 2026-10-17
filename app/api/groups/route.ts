import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { colorForName } from "@/lib/colors";
import { broadcastLobby } from "@/lib/events";
import { categorySchema, groupNameSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const body = await req.json();
  const name = groupNameSchema.parse(body.name);
  const category = categorySchema.parse(body.category);
  const group = await getStore().createGroup(name, colorForName(name), category, userId);
  if (!group) return json({ error: "Name taken" }, { status: 409 });
  await broadcastLobby({ type: "group_created", payload: { groupId: group.id } });
  return json(group, { status: 201 });
});
