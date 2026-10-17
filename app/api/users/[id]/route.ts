import { handle, json } from "@/lib/api";
import { AuthError, requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { profilePatchSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/users/[id]">) => {
  const { id } = await ctx.params;
  const user = await getStore().getUser(id);
  return user ? json(user) : json({ error: "Not found" }, { status: 404 });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/users/[id]">) => {
  const { id } = await ctx.params;
  const me = await requireUser(req);
  if (me !== id) throw new AuthError("Can only edit your own profile");
  const patch = profilePatchSchema.parse(await req.json());
  const user = await getStore().updateUser(id, patch);
  await broadcastLobby({ type: "user_updated", payload: { userId: id } });
  return json(user);
});
