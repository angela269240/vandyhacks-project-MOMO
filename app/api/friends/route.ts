import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return json(await getStore().getFriendState(userId));
});
