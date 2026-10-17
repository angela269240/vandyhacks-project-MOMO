import { handle, json } from "@/lib/api";
import { AuthError, requireUser } from "@/lib/auth";
import { broadcastLobby } from "@/lib/events";
import { profilePatchSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";

/** Bookmarks are private: only the owner (presenting their device key) gets them back. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/users/[id]">) => {
  const { id } = await ctx.params;
  const user = await getStore().getUser(id);
  if (!user) return json({ error: "Not found" }, { status: 404 });
  const isOwner = await requireUser(req).then((me) => me === id, () => false);
  if (!isOwner) delete user.bookmarks;
  return json(user);
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
